import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger(__name__)


@shared_task(name='interviews.tasks.mark_no_shows')
def mark_no_shows():
    """
    Beat task (runs every minute):
    1. AI scheduled and now > join_closes_at -> no_show.
    2. HR scheduled never joined (started_at null) and now > reserved_until -> no_show.
    3. AI in_progress past ends_at + 2 min -> incomplete.
    """
    from interviews.models import Interview

    now = timezone.now()

    # 1. AI scheduled past join_closes_at -> no_show
    count_ai = Interview.objects.filter(
        kind='ai',
        status='scheduled',
        join_closes_at__lt=now
    ).update(status='no_show')

    # 2. HR scheduled where started_at is null and reserved_until has passed -> no_show
    count_hr = Interview.objects.filter(
        kind='hr',
        status='scheduled',
        started_at__isnull=True,
        reserved_until__lt=now
    ).update(status='no_show')

    # 3. AI in_progress past ends_at + 2 min -> incomplete
    # ends_at = started_at + duration_minutes
    ai_in_progress = list(Interview.objects.filter(kind='ai', status='in_progress'))
    incomplete_ids = []
    for intv in ai_in_progress:
        base_time = intv.started_at or intv.start_at
        ends_at = base_time + timedelta(minutes=intv.duration_minutes)
        if now > ends_at + timedelta(minutes=2):
            incomplete_ids.append(intv.id)

    count_incomplete = 0
    if incomplete_ids:
        count_incomplete = Interview.objects.filter(id__in=incomplete_ids).update(
            status='incomplete',
            ended_at=now
        )

    logger.info(
        f"mark_no_shows: {count_ai} AI no-shows, {count_hr} HR no-shows, {count_incomplete} AI incomplete."
    )
    return f"ai_no_show={count_ai}, hr_no_show={count_hr}, ai_incomplete={count_incomplete}"


@shared_task(name='interviews.tasks.score_interview_task', bind=True, max_retries=3)
def score_interview_task(self, ai_result_id):
    """
    Asynchronously scores an AI interview transcript using OpenAI LLM evaluation (or rubric fallback).
    Stores scores (technical 40, depth 25, communication 20, relevance 15), total (100),
    justification, model_name, and prompt_version.
    """
    from interviews.models import AIResult
    from ai.services import score_interview

    try:
        ai_result = AIResult.objects.select_related('interview__job', 'interview__application').get(id=ai_result_id)
    except AIResult.DoesNotExist:
        logger.error(f"AIResult {ai_result_id} not found for scoring.")
        return f"AIResult {ai_result_id} not found."

    if ai_result.scoring_status == 'done':
        return f"AIResult {ai_result_id} already scored."

    job = ai_result.interview.job
    try:
        eval_result = score_interview(
            transcript=ai_result.transcript or [],
            job_title=job.title,
            job_description=job.description,
            required_skills=job.required_skills
        )
        ai_result.score = eval_result['total']
        ai_result.score_breakdown = eval_result
        ai_result.scoring_status = 'done'
        ai_result.model_name = eval_result.get('model', 'gpt-4o-mini')
        ai_result.prompt_version = eval_result.get('prompt_version', 'v1.0')
        ai_result.scored_at = timezone.now()
        ai_result.save()
        logger.info(f"AIResult {ai_result_id} successfully scored: {ai_result.score}/100.")
        return f"AIResult {ai_result_id} scored: {ai_result.score}."
    except Exception as exc:
        logger.error(f"Error scoring AIResult {ai_result_id}: {exc}")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30)
        ai_result.scoring_status = 'failed'
        ai_result.save(update_fields=['scoring_status'])
        return f"Scoring failed for {ai_result_id} after {self.max_retries} retries."


@shared_task(name='interviews.tasks.check_round2_complete')
def check_round2_complete():
    """
    Beat task (runs every minute):
    - Identifies jobs in stage 'ai_interview' (not deleted).
    - Checks if all AI interviews are terminal ('completed', 'incomplete', 'no_show', 'cancelled').
    - Checks that scoring is done or failed for all completed interviews.
    - Inside a transaction (select_for_update):
      - Re-verifies stage == 'ai_interview'.
      - Proposes top `final_shortlist_count` by AI score desc, tie-breaker CV score desc, applied_at asc.
      - No-shows are excluded from advancing.
      - Sets advance_next=True for the top qualifiers, False for others.
      - Transitions stage -> 'ai_review'.
      - Marks JobRound 2 as completed and hr_notified.
      - Queues round completion email to HR.
    """
    from jobs.models import Job, JobRound
    from applications.models import Application
    from interviews.models import Interview, AIResult
    from notifications.tasks import send_round_finished_hr_email

    terminal_statuses = ['completed', 'incomplete', 'no_show', 'cancelled']
    jobs = list(Job.objects.filter(stage='ai_interview', is_deleted=False))

    processed_jobs = 0
    now = timezone.now()

    for job in jobs:
        ai_interviews = list(Interview.objects.filter(job=job, kind='ai'))
        if not ai_interviews:
            continue

        # Check if any interview is not yet terminal
        non_terminal_exists = any(intv.status not in terminal_statuses for intv in ai_interviews)
        if non_terminal_exists:
            continue

        # Check if any completed interview still has scoring pending
        pending_scoring = AIResult.objects.filter(
            interview__in=ai_interviews,
            interview__status='completed',
            scoring_status='pending'
        ).exists()
        if pending_scoring:
            logger.info(f"Job {job.id} all AI interviews terminal, but scoring still pending.")
            continue

        with transaction.atomic():
            locked_job = Job.objects.select_for_update().get(id=job.id)
            if locked_job.stage != 'ai_interview':
                continue

            # Reset previous advance flags for this job
            Application.objects.filter(job=locked_job).update(advance_next=False)

            # Query candidates invited to AI interview who attended (excluding no_show)
            attended_interviews = Interview.objects.filter(
                job=locked_job,
                kind='ai'
            ).exclude(status='no_show').select_related('application', 'ai_result')

            # Build ranking list
            scored_candidates = []
            for intv in attended_interviews:
                app = intv.application
                ai_score = getattr(getattr(intv, 'ai_result', None), 'score', None)
                if ai_score is None:
                    ai_score = -1  # incomplete / un-scored
                cv_score = app.cv_score or 0
                scored_candidates.append({
                    'application': app,
                    'ai_score': ai_score,
                    'cv_score': cv_score,
                    'applied_at': app.applied_at
                })

            # Sort: ai_score DESC, cv_score DESC, applied_at ASC
            scored_candidates.sort(
                key=lambda x: (-x['ai_score'], -x['cv_score'], x['applied_at'])
            )

            # Propose top final_shortlist_count
            top_n = locked_job.final_shortlist_count
            advancing_ids = []
            for rank_idx, item in enumerate(scored_candidates):
                if rank_idx < top_n:
                    advancing_ids.append(item['application'].id)

            if advancing_ids:
                Application.objects.filter(id__in=advancing_ids).update(advance_next=True)

            # Transition stage to ai_review
            locked_job.stage = 'ai_review'
            locked_job.save(update_fields=['stage', 'updated_at'])

            # Mark JobRound 2 completed and notified
            round_2, _ = JobRound.objects.get_or_create(job=locked_job, round=2)
            round_2.completed_at = now
            round_2.hr_notified_at = now
            round_2.save(update_fields=['completed_at', 'hr_notified_at'])

            # Queue HR notification email on commit
            j_id_str = str(locked_job.id)
            transaction.on_commit(lambda j_id=j_id_str: send_round_finished_hr_email.delay(j_id, 2))

            processed_jobs += 1
            logger.info(
                f"Job {locked_job.id} transitioned to ai_review. Candidates advancing: {len(advancing_ids)}."
            )

    return f"check_round2_complete finished. Processed {processed_jobs} jobs."
