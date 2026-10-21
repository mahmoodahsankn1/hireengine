from datetime import timedelta
from django.utils import timezone
from django.db.models import Q
from interviews.models import Interview

class NotEnoughSlots(Exception):
    def __init__(self, shortfall, message=None):
        self.shortfall = shortfall
        super().__init__(message or f"Not enough slots available. Shortfall: {shortfall}")

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
    earliest = now + timedelta(minutes=60)

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

def calculate_capacity(job, kind=None, windows_override=None):
    """
    Returns available slot count for a job for AI, HR, or both.
    """
    if kind == 'ai':
        return len(generate_slots(job, 'ai', windows_override=windows_override))
    elif kind == 'hr':
        return len(generate_slots(job, 'hr', windows_override=windows_override))
    else:
        return {
            'ai_capacity': len(generate_slots(job, 'ai', windows_override=windows_override)),
            'hr_capacity': len(generate_slots(job, 'hr', windows_override=windows_override)),
        }
