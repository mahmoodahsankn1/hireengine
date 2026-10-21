import uuid
from django.db import models
from django.db.models import Func, Q
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator
from django.contrib.postgres.fields import DateTimeRangeField, RangeBoundary, RangeOperators
from django.contrib.postgres.constraints import ExclusionConstraint
from jobs.models import Job
from applications.models import Application

class TsTzRange(Func):
    function = 'TSTZRANGE'
    output_field = DateTimeRangeField()

class Interview(models.Model):
    KINDS = [
        ('ai', 'AI Interview'),
        ('hr', 'HR Interview'),
    ]

    STATUSES = [
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('incomplete', 'Incomplete'),
        ('no_show', 'No Show'),
        ('cancelled', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='interviews')
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='interviews')
    hr = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='interviews')
    kind = models.CharField(max_length=10, choices=KINDS)
    start_at = models.DateTimeField()
    duration_minutes = models.SmallIntegerField()
    reserved_until = models.DateTimeField(help_text='start_at + duration + buffer')
    join_opens_at = models.DateTimeField(help_text='start_at - join_early')
    join_closes_at = models.DateTimeField(help_text='AI: start_at + late_grace; HR: start_at + duration')
    access_token = models.CharField(max_length=64, unique=True)
    room_name = models.CharField(max_length=255, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUSES, default='scheduled')
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'interviews'
        constraints = [
            models.UniqueConstraint(fields=['application', 'kind'], name='unique_application_interview_kind'),
            models.CheckConstraint(
                condition=models.Q(kind__in=['ai', 'hr']),
                name='interview_kind_valid'
            ),
            ExclusionConstraint(
                name='interviews_no_overlap',
                condition=~models.Q(status='cancelled'),
                expressions=[
                    ('hr', RangeOperators.EQUAL),
                    ('kind', RangeOperators.EQUAL),
                    (TsTzRange('start_at', 'reserved_until', RangeBoundary()), RangeOperators.OVERLAPS),
                ],
            ),
        ]
        indexes = [
            models.Index(fields=['job', 'kind', 'status'], name='intv_job_kind_status_idx'),
            models.Index(fields=['start_at'], name='intv_start_at_idx'),
        ]

    def __str__(self):
        return f"{self.kind.upper()} interview for {self.application.full_name} ({self.status})"

class AIResult(models.Model):
    SCORING_STATUSES = [
        ('pending', 'Pending'),
        ('done', 'Done'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    interview = models.OneToOneField(Interview, on_delete=models.CASCADE, related_name='ai_result')
    transcript = models.JSONField(null=True, blank=True, help_text='turns: [{speaker, text, time}]')
    score = models.SmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    score_breakdown = models.JSONField(null=True, blank=True)
    scoring_status = models.CharField(max_length=20, choices=SCORING_STATUSES, default='pending')
    model_name = models.CharField(max_length=100, blank=True, default='')
    prompt_version = models.CharField(max_length=50, blank=True, default='')
    scored_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'ai_results'

    def __str__(self):
        return f"AI Result for Interview {self.interview_id} (Score: {self.score})"

class Feedback(models.Model):
    DECISIONS = [
        ('selected', 'Selected'),
        ('rejected', 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    interview = models.OneToOneField(Interview, on_delete=models.CASCADE, related_name='feedback')
    rating = models.SmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)]
    )
    notes = models.TextField(null=True, blank=True)
    decision = models.CharField(max_length=20, choices=DECISIONS)
    submitted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'feedback'

    def __str__(self):
        return f"Feedback for Interview {self.interview_id} - {self.decision}"
