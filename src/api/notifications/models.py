import uuid
from django.db import models
from django.utils import timezone
from jobs.models import Job
from applications.models import Application

class EmailLog(models.Model):
    KINDS = [
        ('otp', 'OTP Verification'),
        ('application_received', 'Application Received'),
        ('round_finished_hr', 'Round Finished HR Notification'),
        ('ai_invite', 'AI Interview Invitation'),
        ('ai_regret', 'AI Regret'),
        ('hr_invite', 'HR Interview Invitation'),
        ('hr_regret', 'HR Regret'),
        ('final_selected', 'Final Selection'),
        ('final_rejected', 'Final Rejection'),
    ]

    STATUSES = [
        ('queued', 'Queued'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.EmailField()
    kind = models.CharField(max_length=40, choices=KINDS)
    job = models.ForeignKey(Job, on_delete=models.SET_NULL, null=True, blank=True, related_name='email_logs')
    application = models.ForeignKey(Application, on_delete=models.SET_NULL, null=True, blank=True, related_name='email_logs')
    status = models.CharField(max_length=20, choices=STATUSES, default='queued')
    attempts = models.SmallIntegerField(default=0)
    error = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'email_logs'
        constraints = [
            models.UniqueConstraint(
                fields=['application', 'kind'],
                condition=models.Q(application__isnull=False),
                name='unique_application_email_kind'
            ),
        ]

    def __str__(self):
        return f"Email {self.kind} to {self.recipient} ({self.status})"
