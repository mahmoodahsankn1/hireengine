from datetime import timedelta
from django.utils import timezone
from django.db.models import Q
from interviews.models import Interview

class NotEnoughSlots(Exception):
    def __init__(self, shortfall, message=None):
        self.shortfall = shortfall
        super().__init__(message or f"Not enough slots available. Shortfall: {shortfall}")

def format_interview_datetime(dt, tz_name='Asia/Kolkata'):
    """
    Formats a datetime in the specified timezone with timezone label.
    """
    if not dt:
        return "TBD"
    import zoneinfo
    try:
        tz = zoneinfo.ZoneInfo(tz_name or 'Asia/Kolkata')
    except Exception:
        tz = zoneinfo.ZoneInfo('Asia/Kolkata')

    localized = dt.astimezone(tz)
    return localized.strftime("%A, %d %B %Y at %I:%M %p") + f" ({tz_name or 'Asia/Kolkata'})"


def generate_slots(job, kind, windows_override=None, current_time=None, exclude_interview_ids=None):
    """
    Generates available interview slot start datetimes for a given job and interview kind ('ai' or 'hr').
    
    SRS & Architecture rules:
    - Slot length = duration + buffer
    - Earliest slot >= now + 60 minutes
    - Sorted windows for the round (Round 2 for AI, Round 3 for HR)
    - Drops any slot whose [s, s + dur + buf) overlaps existing non-cancelled interviews
      for the same HR and kind.
    """
    if kind not in ('ai', 'hr'):
        raise ValueError(f"Invalid interview kind: {kind}")

    round_number = 2 if kind == 'ai' else 3
    dur_minutes = job.ai_duration_minutes if kind == 'ai' else job.hr_duration_minutes
    buf_minutes = job.ai_buffer_minutes if kind == 'ai' else job.hr_buffer_minutes

    dur = timedelta(minutes=dur_minutes)
    buf = timedelta(minutes=buf_minutes)
    slot_total = dur + buf

    now = current_time or timezone.now()
    # Small grace period to avoid scheduling slots in the literal past
    earliest = now + timedelta(minutes=1)

    # Resolve windows
    if windows_override is not None:
        windows = [
            w for w in windows_override
            if getattr(w, 'round', None) == round_number or (isinstance(w, dict) and w.get('round') == round_number)
        ]
        # Sort windows by start_at
        windows.sort(key=lambda w: getattr(w, 'start_at', None) or w.get('start_at'))
    else:
        windows = list(job.availability_windows.filter(round=round_number).order_by('start_at'))

    if not windows:
        return []

    # Fetch existing non-cancelled interviews for this HR user and kind
    hr_user = job.hr
    conflicting_query = Interview.objects.filter(
        hr=hr_user,
        kind=kind,
    ).exclude(status='cancelled')

    if exclude_interview_ids:
        conflicting_query = conflicting_query.exclude(id__in=exclude_interview_ids)

    # We only care about interviews in the future or overlapping with windows
    conflicting_interviews = list(conflicting_query.filter(reserved_until__gte=earliest).values('start_at', 'reserved_until'))

    slots = []
    for w in windows:
        w_start = getattr(w, 'start_at', None) if not isinstance(w, dict) else w.get('start_at')
        w_end = getattr(w, 'end_at', None) if not isinstance(w, dict) else w.get('end_at')

        if not w_start or not w_end:
            continue

        s = max(w_start, earliest)
        while s + dur <= w_end:
            slot_end = s + slot_total
            # Check overlap: slot [s, slot_end) with interview [intv_start, intv_reserved)
            # Overlap happens if intv_start < slot_end and intv_reserved > s
            clash = any(
                intv['start_at'] < slot_end and intv['reserved_until'] > s
                for intv in conflicting_interviews
            )
            if not clash:
                slots.append(s)

            s += slot_total

    return slots

def calculate_capacity(job, kind=None, windows_override=None, current_time=None):
    """
    Returns available slot count for a job for AI, HR, or both.
    """
    if kind == 'ai':
        return len(generate_slots(job, 'ai', windows_override=windows_override, current_time=current_time))
    elif kind == 'hr':
        return len(generate_slots(job, 'hr', windows_override=windows_override, current_time=current_time))
    else:
        return {
            'ai_capacity': len(generate_slots(job, 'ai', windows_override=windows_override, current_time=current_time)),
            'hr_capacity': len(generate_slots(job, 'hr', windows_override=windows_override, current_time=current_time)),
        }

def preview_allocation(job, kind, apps, current_time=None):
    """
    Generates a preview of candidate-to-slot allocations without persisting anything.
    Returns:
        slots: list of dicts with application info and proposed slot timing.
        shortfall: number of missing slots if len(slots) < len(apps), else 0.
        can_allocate: boolean indicating if all apps can be assigned a slot.
    """
    now = current_time or timezone.now()
    available_slots = generate_slots(job, kind, current_time=now)
    available_slots.sort()

    app_list = list(apps)
    slot_count = len(available_slots)
    app_count = len(app_list)
    shortfall = max(0, app_count - slot_count)

    assignments = []
    for idx, app in enumerate(app_list):
        if idx < slot_count:
            slot_time = available_slots[idx]
            assignments.append({
                'application_id': str(app.id),
                'candidate_label': getattr(app, 'candidate_label', None) or f"Candidate #{getattr(app, 'cv_rank', None) or idx + 1}",
                'full_name': getattr(app, 'full_name', ''),
                'email': getattr(app, 'email', ''),
                'start_at': slot_time,
                'cv_score': getattr(app, 'cv_score', None),
            })
        else:
            assignments.append({
                'application_id': str(app.id),
                'candidate_label': getattr(app, 'candidate_label', None) or f"Candidate #{getattr(app, 'cv_rank', None) or idx + 1}",
                'full_name': getattr(app, 'full_name', ''),
                'email': getattr(app, 'email', ''),
                'start_at': None,
                'cv_score': getattr(app, 'cv_score', None),
            })

    return {
        'assignments': assignments,
        'total_available_slots': slot_count,
        'candidates_count': app_count,
        'shortfall': shortfall,
        'can_allocate': shortfall == 0,
    }

def allocate(job, kind, apps, current_time=None):
    """
    Allocates interview slots to candidates per HireEngine SRS & Architecture rules:
    - Slots generated chronologically from windows (earliest >= now + 60 min)
    - Free of conflicts with other non-cancelled interviews of same HR and kind
    - Apps assigned in rank order: best candidate gets earliest slot
    - Creates and saves Interview records in a database transaction
    - Retries once if IntegrityError / race condition occurs
    """
    import secrets
    from django.db import transaction, IntegrityError

    if kind not in ('ai', 'hr'):
        raise ValueError(f"Invalid interview kind: {kind}")

    app_list = list(apps)
    if not app_list:
        return []

    dur_minutes = job.ai_duration_minutes if kind == 'ai' else job.hr_duration_minutes
    buf_minutes = job.ai_buffer_minutes if kind == 'ai' else job.hr_buffer_minutes
    join_early = job.ai_join_early_minutes if kind == 'ai' else job.hr_join_early_minutes
    late_grace = job.ai_late_grace_minutes if kind == 'ai' else dur_minutes

    dur = timedelta(minutes=dur_minutes)
    buf = timedelta(minutes=buf_minutes)

    def _attempt_allocation():
        now = current_time or timezone.now()
        slots = generate_slots(job, kind, current_time=now)
        slots.sort()

        if len(slots) < len(app_list):
            shortfall = len(app_list) - len(slots)
            raise NotEnoughSlots(shortfall=shortfall)

        created_interviews = []
        with transaction.atomic():
            for idx, app in enumerate(app_list):
                slot_time = slots[idx]
                token = secrets.token_urlsafe(32)
                room_name = f"hr-{app.id}" if kind == 'hr' else None

                interview = Interview(
                    job=job,
                    application=app,
                    hr=job.hr,
                    kind=kind,
                    start_at=slot_time,
                    duration_minutes=dur_minutes,
                    reserved_until=slot_time + dur + buf,
                    join_opens_at=slot_time - timedelta(minutes=join_early),
                    join_closes_at=slot_time + timedelta(minutes=late_grace),
                    access_token=token,
                    room_name=room_name,
                    status='scheduled',
                )
                interview.save()
                created_interviews.append(interview)

        return created_interviews

    try:
        return _attempt_allocation()
    except IntegrityError:
        # Retry once on collision
        return _attempt_allocation()

