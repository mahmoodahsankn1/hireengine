import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator

class Job(models.Model):
    EMPLOYMENT_TYPES = [
        ('full_time', 'Full Time'),
        ('part_time', 'Part Time'),
        ('internship', 'Internship'),
        ('contract', 'Contract'),
    ]

    WORK_MODES = [
        ('onsite', 'Onsite'),
        ('remote', 'Remote'),
        ('hybrid', 'Hybrid'),
    ]

    STAGES = [
        ('draft', 'Draft'),
        ('collecting', 'Collecting Applications'),
        ('cv_review', 'CV Review'),
        ('ai_interview', 'AI Interview'),
        ('ai_review', 'AI Review'),
        ('hr_interview', 'HR Interview'),
        ('hr_review', 'HR Review'),
        ('completed', 'Completed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hr = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='jobs')
    title = models.CharField(max_length=255)
    description = models.TextField()
    required_skills = models.JSONField(help_text='[{"skill": "Django", "level": "must|nice"}]')
    min_experience_years = models.SmallIntegerField(default=0)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPES)
    location = models.CharField(max_length=255)
    work_mode = models.CharField(max_length=20, choices=WORK_MODES)
    salary_range = models.CharField(max_length=100, null=True, blank=True)
    form_slug = models.CharField(max_length=64, unique=True)
    application_deadline = models.DateTimeField()
    ai_shortlist_count = models.IntegerField(validators=[MinValueValidator(1)])
    final_shortlist_count = models.IntegerField(validators=[MinValueValidator(1)])
    min_cv_score = models.SmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    ai_interview_prompt = models.TextField(blank=True, default='')

    # AI Interview Timing settings
    ai_duration_minutes = models.SmallIntegerField(default=5, validators=[MinValueValidator(1), MaxValueValidator(5)])
    ai_buffer_minutes = models.SmallIntegerField(default=3)
    ai_join_early_minutes = models.SmallIntegerField(default=5)
    ai_late_grace_minutes = models.SmallIntegerField(default=2)

    # HR Interview Timing settings
    hr_duration_minutes = models.SmallIntegerField(default=30)
    hr_buffer_minutes = models.SmallIntegerField(default=5)
    hr_join_early_minutes = models.SmallIntegerField(default=5)

    stage = models.CharField(max_length=30, choices=STAGES, default='draft')
    is_deleted = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'jobs'
        indexes = [
            models.Index(fields=['hr', 'is_deleted'], name='jobs_hr_is_deleted_idx'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(final_shortlist_count__lte=models.F('ai_shortlist_count')),
                name='final_shortlist_count_lte_ai_count'
            ),
            models.CheckConstraint(
                condition=models.Q(ai_duration_minutes__gte=1, ai_duration_minutes__lte=5),
                name='ai_duration_minutes_1_to_5'
            ),
            models.CheckConstraint(
                condition=models.Q(ai_late_grace_minutes__lte=models.F('ai_buffer_minutes')),
                name='ai_late_grace_lte_buffer'
            ),
        ]

    def __str__(self):
        return f"{self.title} ({self.stage})"

class AvailabilityWindow(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='availability_windows')
    round = models.SmallIntegerField(choices=[(2, 'Round 2 - AI'), (3, 'Round 3 - HR')])
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()

    class Meta:
        db_table = 'availability_windows'
        indexes = [
            models.Index(fields=['job', 'round'], name='avail_win_job_round_idx'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(round__in=[2, 3]),
                name='avail_win_round_check'
            ),
            models.CheckConstraint(
                condition=models.Q(end_at__gt=models.F('start_at')),
                name='avail_win_end_gt_start'
            ),
        ]

    def __str__(self):
        return f"Window Round {self.round} ({self.start_at} - {self.end_at})"

class JobRound(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name='rounds')
    round = models.SmallIntegerField(choices=[(1, 'Round 1 - CV'), (2, 'Round 2 - AI'), (3, 'Round 3 - HR')])
    completed_at = models.DateTimeField(null=True, blank=True)
    hr_notified_at = models.DateTimeField(null=True, blank=True)
    emails_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'job_rounds'
        unique_together = ('job', 'round')
        constraints = [
            models.CheckConstraint(
                condition=models.Q(round__in=[1, 2, 3]),
                name='job_round_valid_check'
            ),
        ]

    def __str__(self):
        return f"{self.job.title} - Round {self.round}"
