import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name='interviews.tasks.mark_no_shows')
def mark_no_shows():
    """
    Beat task (every minute): Marks AI/HR interviews as no_show if the join
    window has closed and the candidate never started.
    Implemented fully in Phase 5 — this stub satisfies the beat schedule.
    """
    from interviews.models import Interview

    now = timezone.now()

    # AI scheduled past join_closes_at → no_show
    ai_no_shows = Interview.objects.filter(
        kind='ai',
        status='scheduled',
        join_closes_at__lt=now
    )
    count_ai = ai_no_shows.update(status='no_show')

    # HR scheduled where started_at is null and reserved_until has passed → no_show
    hr_no_shows = Interview.objects.filter(
        kind='hr',
        status='scheduled',
        started_at__isnull=True,
        reserved_until__lt=now
    )
    count_hr = hr_no_shows.update(status='no_show')

    # AI in_progress past ends_at + 2 min → incomplete
    from django.db.models import ExpressionWrapper, DateTimeField, F, DurationValue
    from datetime import timedelta
    ai_incomplete = Interview.objects.filter(
        kind='ai',
        status='in_progress',
    ).extra(
        where=["start_at + (duration_minutes * INTERVAL '1 minute') + INTERVAL '2 minutes' < NOW()"]
    )
    count_incomplete = ai_incomplete.update(status='incomplete')

    logger.info(
        f"mark_no_shows: {count_ai} AI no-shows, {count_hr} HR no-shows, {count_incomplete} AI incomplete."
    )
    return f"ai_no_show={count_ai}, hr_no_show={count_hr}, ai_incomplete={count_incomplete}"
