from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.core import mail
from rest_framework.test import APIClient

from accounts.models import User
from jobs.models import Job
from applications.models import Application
from interviews.models import Interview
from notifications.models import EmailLog
from notifications.tasks import send_email_task, queue_application_email

class NotificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hr = User.objects.create_user(
            email='hr_notif@example.com',
            password='Password123!',
            full_name='HR Notification Tester',
            company_name='Test Notify Corp',
            is_email_verified=True,
            timezone='Asia/Kolkata',
        )
        self.client.force_authenticate(user=self.hr)
        self.now = timezone.now()

        self.job = Job.objects.create(
            hr=self.hr,
            title='Staff Engineer',
            form_slug='staff-engineer-notif',
            description='Role JD',
            required_skills=[{"skill": "Python", "level": "must"}],
            application_deadline=self.now + timedelta(days=2),
            ai_shortlist_count=2,
            final_shortlist_count=1,
            ai_duration_minutes=5,
            ai_buffer_minutes=3,
            ai_join_early_minutes=5,
            ai_late_grace_minutes=2,
            hr_duration_minutes=30,
            hr_buffer_minutes=5,
            hr_join_early_minutes=5,
            stage='collecting',
        )

        self.app = Application.objects.create(
            job=self.job,
            full_name='Eva Candidate',
            email='eva@example.com',
            phone='+919876543299',
            email_normalized='eva@example.com',
            phone_normalized='9876543299',
            cv_score=90,
            processing_status='done',
        )

    def test_send_ai_invite_email_content_and_delivery(self):
        # Create an interview
        start_time = self.now + timedelta(hours=3)
        interview = Interview.objects.create(
            job=self.job,
            application=self.app,
            hr=self.hr,
            kind='ai',
            start_at=start_time,
            duration_minutes=5,
            reserved_until=start_time + timedelta(minutes=8),
            join_opens_at=start_time - timedelta(minutes=5),
            join_closes_at=start_time + timedelta(minutes=2),
            access_token='secure-token-123456789012345678901234',
            status='scheduled',
        )

        # Clear outbox
        mail.outbox = []

        # Queue AI invite email
        log = queue_application_email(self.app, 'ai_invite', job=self.job)
        self.assertIsNotNone(log)
        log.refresh_from_db()
        self.assertEqual(log.recipient, 'eva@example.com')
        self.assertEqual(log.status, 'sent')
        self.assertIsNotNone(log.sent_at)

        # Verify email in Django outbox
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertIn('Staff Engineer', sent.subject)
        self.assertIn('Test Notify Corp', sent.subject)
        self.assertIn(interview.access_token, sent.body)
        self.assertIn('Asia/Kolkata', sent.body)
        self.assertIn('5 minutes', sent.body)

    def test_queue_application_email_idempotent_no_duplicates(self):
        log1 = queue_application_email(self.app, 'ai_regret', job=self.job)
        log2 = queue_application_email(self.app, 'ai_regret', job=self.job)

        self.assertEqual(log1.id, log2.id)
        self.assertEqual(EmailLog.objects.filter(application=self.app, kind='ai_regret').count(), 1)

    def test_retry_failed_email_endpoint(self):
        log = EmailLog.objects.create(
            recipient='failed@example.com',
            kind='ai_regret',
            job=self.job,
            application=self.app,
            status='failed',
            attempts=3,
            error='Network timeout',
        )

        # Call retry endpoint
        res = self.client.post(f'/api/notifications/emails/{log.id}/retry/')
        self.assertEqual(res.status_code, 200)

        log.refresh_from_db()
        self.assertEqual(log.status, 'sent')

    def test_retry_non_failed_email_rejected(self):
        log = EmailLog.objects.create(
            recipient='sent@example.com',
            kind='ai_regret',
            job=self.job,
            application=self.app,
            status='sent',
        )

        res = self.client.post(f'/api/notifications/emails/{log.id}/retry/')
        self.assertEqual(res.status_code, 400)
        self.assertIn('only failed', res.data['error'].lower())
