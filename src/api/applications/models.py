import uuid
from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator
from jobs.models import Job

class Application(models.Model):
    PROCESSING_STATUSES = [
        ('pending', 'Pending'),
        ('done', 'Done'),
        ('failed', 'Failed'),
    ]

    PIPELINE_STATUSES = [
        ('applied', 'Applied'),
        ('ai_invited', 'AI Invited'),
        ('hr_invited', 'HR Invited'),
        ('selected', 'Selected'),
        ('rejected', 'Rejected'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='applications')
    full_name = models.CharField(max_length=255)
    email = models.EmailField()
    phone = models.CharField(max_length=30)
    email_normalized = models.CharField(max_length=255)
    phone_normalized = models.CharField(max_length=20)
    resume_file = models.FileField(upload_to='resumes/')
    anonymized_text = models.TextField(null=True, blank=True)
    cv_score = models.SmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    score_breakdown = models.JSONField(
        null=True, blank=True,
        help_text='{"skills": 40, "experience": 25, "education": 15, "total": 80, "reason": "...", "prompt_version": "v1", "model": "..."}'
    )
    processing_status = models.CharField(max_length=20, choices=PROCESSING_STATUSES, default='pending')
    processing_attempts = models.SmallIntegerField(default=0)
    cv_rank = models.IntegerField(null=True, blank=True)
    pipeline_status = models.CharField(max_length=20, choices=PIPELINE_STATUSES, default='applied')
    rejected_round = models.SmallIntegerField(null=True, blank=True, choices=[(1, 'Round 1'), (2, 'Round 2'), (3, 'Round 3')])
    advance_next = models.BooleanField(default=False)
    consent_given = models.BooleanField(default=True)
    consent_at = models.DateTimeField(default=timezone.now)
    policy_version = models.CharField(max_length=20, default='v1.0')
    applied_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'applications'
        constraints = [
            models.UniqueConstraint(fields=['job', 'email_normalized'], name='unique_job_email_normalized'),
            models.UniqueConstraint(fields=['job', 'phone_normalized'], name='unique_job_phone_normalized'),
            models.CheckConstraint(
                condition=models.Q(consent_given=True),
                name='application_consent_must_be_true'
            ),
        ]
        indexes = [
            models.Index(fields=['job', '-cv_score'], name='app_job_cv_score_idx'),
            models.Index(fields=['job', 'pipeline_status'], name='app_job_pipeline_status_idx'),
        ]

    def __str__(self):
        return f"{self.full_name} - {self.job.title}"
