import logging
from celery import shared_task
from django.utils import timezone
from django.db import transaction

from jobs.models import Job, JobRound
from applications.models import Application
from notifications.tasks import send_round_finished_hr_email

logger = logging.getLogger(__name__)

@shared_task(name='jobs.tasks.check_deadlines')
def check_deadlines():
    """
    Beat task (runs every minute):
    - Identifies 'collecting' jobs whose deadline has passed (deadline <= now).
    - Skips any job if any application is still 'pending' processing.
    - Inside a transaction (with select_for_update):
      - Ranks completed applications by (cv_score DESC, applied_at ASC), skipping failed/below min.
      - Sets cv_rank for qualified candidates.
      - Sets advance_next=True for the top N (where N = ai_shortlist_count).
      - Transitions stage to 'cv_review'.
      - Marks JobRound 1 as completed and notified.
      - Queues round completion email and notification to HR.
    """
    now = timezone.now()
    job_ids = list(
        Job.objects.filter(
            stage='collecting',
            application_deadline__lte=now,
            is_deleted=False
        ).values_list('id', flat=True)
    )

    if not job_ids:
        return "No expired collecting jobs found."

    processed_count = 0
    for job_id in job_ids:
        with transaction.atomic():
            try:
                job = Job.objects.select_for_update().select_related('hr').get(
                    id=job_id,
                    stage='collecting',
                    is_deleted=False
                )
            except Job.DoesNotExist:
                continue

            if job.application_deadline > timezone.now():
                continue

            # Skip if any application is still pending
            has_pending = Application.objects.filter(job=job, processing_status='pending').exists()
            if has_pending:
                logger.info(f"Job {job.id} deadline passed but pending CVs still exist — waiting for processing.")
                continue

            # Reset previous ranks/advances
            Application.objects.filter(job=job).update(advance_next=False, cv_rank=None)

            # Filter qualified applications
            min_score = job.min_cv_score if job.min_cv_score is not None else 0
            qualified_apps = list(
                Application.objects.filter(
                    job=job,
                    processing_status='done',
                    cv_score__gte=min_score,
                ).order_by('-cv_score', 'applied_at')
            )

            top_n = job.ai_shortlist_count
            for rank, app in enumerate(qualified_apps, start=1):
                is_top = (rank <= top_n)
                Application.objects.filter(pk=app.pk).update(
                    cv_rank=rank,
                    advance_next=is_top
                )

            # Transition stage to cv_review
            job.stage = 'cv_review'
            job.save(update_fields=['stage', 'updated_at'])

            # Mark round 1 completed and notified
            round_1, _ = JobRound.objects.get_or_create(job=job, round=1)
            round_1.completed_at = now
            round_1.hr_notified_at = now
            round_1.save(update_fields=['completed_at', 'hr_notified_at'])

            # Queue HR notification email on transaction commit
            j_id_str = str(job.id)
            transaction.on_commit(lambda j_id=j_id_str: send_round_finished_hr_email.delay(j_id, 1))

            processed_count += 1
            logger.info(
                f"Job {job.id} transitioned to cv_review. Qualified: {len(qualified_apps)}, "
                f"Proposed: {min(len(qualified_apps), top_n)}."
            )

    return f"check_deadlines completed. Processed {processed_count} jobs."
