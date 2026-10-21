import logging
from celery import shared_task
from django.utils import timezone
from django.db import transaction

logger = logging.getLogger(__name__)


@shared_task(name='jobs.tasks.check_deadlines')
def check_deadlines():
    """
    Beat task (every minute): Finds 'collecting' jobs with deadline <= now
    where no application is still 'pending'. Transitions them to 'cv_review',
    ranks applications, proposes top N, creates JobRound row.
    Implemented in Phase 4 — this stub satisfies the Celery beat schedule.
    """
    from jobs.models import Job
    from applications.models import Application

    now = timezone.now()
    expired_jobs = Job.objects.filter(
        stage='collecting',
        application_deadline__lte=now,
        is_deleted=False
    ).select_for_update()

    with transaction.atomic():
        for job in expired_jobs:
            # Skip if any application is still pending
            has_pending = Application.objects.filter(job=job, processing_status='pending').exists()
            if has_pending:
                logger.info(f"Job {job.id} deadline passed but pending CVs exist — skipping.")
                continue

            # Re-check stage inside lock
            job.refresh_from_db()
            if job.stage != 'collecting':
                continue

            # Rank applications (Phase 4 full logic)
            apps = Application.objects.filter(
                job=job,
                processing_status='done'
            ).order_by('-cv_score', 'applied_at')

            min_score = job.min_cv_score or 0
            qualified = [a for a in apps if (a.cv_score or 0) >= min_score]

            top_n = qualified[:job.ai_shortlist_count]
            for rank, app in enumerate(top_n, start=1):
                Application.objects.filter(pk=app.pk).update(
                    cv_rank=rank,
                    advance_next=True
                )

            # Transition stage
            job.stage = 'cv_review'
            job.save(update_fields=['stage'])

            # Mark round 1 completed
            from jobs.models import JobRound
            JobRound.objects.filter(job=job, round=1).update(completed_at=now)

            logger.info(f"Job {job.id} transitioned to cv_review with {len(top_n)} candidates proposed.")

    return "check_deadlines completed"
