import uuid
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from jobs.models import Job, AvailabilityWindow, JobRound
from jobs.tasks import check_deadlines
from applications.models import Application
from interviews.models import Interview
from notifications.models import EmailLog

class Phase4RoundEngineAndSendTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hr = User.objects.create_user(
            email='hr_phase4@example.com',
            password='Password123!',
            full_name='HR Phase 4',
            company_name='Flow Tech',
            is_email_verified=True,
            timezone='Asia/Kolkata',
        )
        self.client.force_authenticate(user=self.hr)
        self.now = timezone.now()

        # Job in collecting stage with deadline in past for testing check_deadlines
        self.job = Job.objects.create(
            hr=self.hr,
            title='Backend Developer',
            form_slug='backend-dev-slug',
            description='Django backend developer role',
            required_skills=[{"skill": "Django", "level": "must"}],
            application_deadline=self.now - timedelta(minutes=5),  # deadline has passed
            ai_shortlist_count=2,
            final_shortlist_count=1,
            min_cv_score=60,
            ai_duration_minutes=5,
            ai_buffer_minutes=3,
            ai_join_early_minutes=5,
            ai_late_grace_minutes=2,
            hr_duration_minutes=30,
            hr_buffer_minutes=5,
            hr_join_early_minutes=5,
            stage='collecting',
        )

        # AI availability window for Round 2 (2 hours in future, 3 slots)
        self.ai_window = AvailabilityWindow.objects.create(
            job=self.job,
            round=2,
            start_at=self.now + timedelta(hours=2),
            end_at=self.now + timedelta(hours=2, minutes=24),  # 24 min = 3 slots of 8 min
        )

        # Candidates
        self.app1 = Application.objects.create(
            job=self.job,
            full_name='Alice Smith',
            email='alice@example.com',
            phone='+919876543201',
            email_normalized='alice@example.com',
            phone_normalized='9876543201',
            cv_score=92,
            processing_status='done',
            applied_at=self.now - timedelta(hours=3),
        )
        self.app2 = Application.objects.create(
            job=self.job,
            full_name='Bob Jones',
            email='bob@example.com',
            phone='+919876543202',
            email_normalized='bob@example.com',
            phone_normalized='9876543202',
            cv_score=85,
            processing_status='done',
            applied_at=self.now - timedelta(hours=2),
        )
        self.app3 = Application.objects.create(
            job=self.job,
            full_name='Charlie Brown',
            email='charlie@example.com',
            phone='+919876543203',
            email_normalized='charlie@example.com',
            phone_normalized='9876543203',
            cv_score=75,
            processing_status='done',
            applied_at=self.now - timedelta(hours=1),
        )
        self.app_low = Application.objects.create(
            job=self.job,
            full_name='Dave Low',
            email='dave@example.com',
            phone='+919876543204',
            email_normalized='dave@example.com',
            phone_normalized='9876543204',
            cv_score=40,  # Below min_cv_score 60
            processing_status='done',
            applied_at=self.now - timedelta(hours=1),
        )

    def test_check_deadlines_skips_when_pending_cvs_exist(self):
        # Mark one app as pending
        self.app3.processing_status = 'pending'
        self.app3.save(update_fields=['processing_status'])

        result = check_deadlines()
        self.job.refresh_from_db()
        # Stage must remain 'collecting' because an app is pending
        self.assertEqual(self.job.stage, 'collecting')

    def test_check_deadlines_ranks_proposes_and_advances_stage(self):
        with self.captureOnCommitCallbacks(execute=True):
            result = check_deadlines()
        self.job.refresh_from_db()

        # Job stage must transition to cv_review
        self.assertEqual(self.job.stage, 'cv_review')

        # Check rankings
        self.app1.refresh_from_db()
        self.app2.refresh_from_db()
        self.app3.refresh_from_db()
        self.app_low.refresh_from_db()

        # Alice: rank 1, advance_next=True (top 2)
        self.assertEqual(self.app1.cv_rank, 1)
        self.assertTrue(self.app1.advance_next)

        # Bob: rank 2, advance_next=True (top 2)
        self.assertEqual(self.app2.cv_rank, 2)
        self.assertTrue(self.app2.advance_next)

        # Charlie: rank 3, advance_next=False
        self.assertEqual(self.app3.cv_rank, 3)
        self.assertFalse(self.app3.advance_next)

        # Dave: below min_cv_score, no rank and advance_next=False
        self.assertIsNone(self.app_low.cv_rank)
        self.assertFalse(self.app_low.advance_next)

        # JobRound 1 must be marked completed and notified
        round1 = JobRound.objects.get(job=self.job, round=1)
        self.assertIsNotNone(round1.completed_at)
        self.assertIsNotNone(round1.hr_notified_at)

        # HR email log created
        email_log = EmailLog.objects.filter(job=self.job, kind='round_finished_hr').first()
        self.assertIsNotNone(email_log)
        self.assertEqual(email_log.recipient, self.hr.email)

    def test_patch_advance_toggle_and_capacity_enforcement(self):
        # Run check_deadlines first to move to cv_review
        check_deadlines()
        self.job.refresh_from_db()

        # Currently 2 apps advance (Alice, Bob). Window has 3 slots.
        # Toggle Charlie (app3) to True -> 3 apps advancing <= 3 slots -> should succeed
        res = self.client.patch(f'/api/applications/{self.app3.id}/advance/', {'advance_next': True})
        self.assertEqual(res.status_code, 200)
        self.app3.refresh_from_db()
        self.assertTrue(self.app3.advance_next)

        # Now 3 apps advance. Trying to advance a 4th candidate (Dave) exceeds slot capacity 3
        res2 = self.client.patch(f'/api/applications/{self.app_low.id}/advance/', {'advance_next': True})
        self.assertEqual(res2.status_code, 400)
        self.assertIn('capacity', res2.data['error'].lower())

    def test_send_preview_endpoint(self):
        check_deadlines()
        res = self.client.get(f'/api/jobs/{self.job.id}/send/')
        self.assertEqual(res.status_code, 200)
        data = res.data

        self.assertEqual(data['round_number'], 1)
        self.assertEqual(data['stage'], 'cv_review')
        self.assertTrue(data['can_send'])
        self.assertFalse(data['already_sent'])
        self.assertEqual(data['advancing_count'], 2)
        self.assertEqual(len(data['advancing']), 2)
        # Check start_at_formatted includes timezone
        self.assertIn('Asia/Kolkata', data['advancing'][0]['start_at_formatted'])
        self.assertEqual(data['total_available_slots'], 3)
        self.assertEqual(data['shortfall'], 0)

    def test_send_invitations_and_double_send_refusal(self):
        check_deadlines()

        # Send invitations with send_regret=True
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.post(f'/api/jobs/{self.job.id}/send/', {'send_regret': True})
        self.assertEqual(res.status_code, 200)

        self.job.refresh_from_db()
        self.assertEqual(self.job.stage, 'ai_interview')

        # Check interviews created
        intvs = Interview.objects.filter(job=self.job, kind='ai')
        self.assertEqual(intvs.count(), 2)

        # Check candidate pipeline statuses
        self.app1.refresh_from_db()
        self.app2.refresh_from_db()
        self.app3.refresh_from_db()
        self.assertEqual(self.app1.pipeline_status, 'ai_invited')
        self.assertEqual(self.app2.pipeline_status, 'ai_invited')
        self.assertEqual(self.app3.pipeline_status, 'rejected')
        self.assertEqual(self.app3.rejected_round, 1)

        # Check emails queued
        ai_invites = EmailLog.objects.filter(job=self.job, kind='ai_invite')
        self.assertEqual(ai_invites.count(), 2)

        ai_regrets = EmailLog.objects.filter(job=self.job, kind='ai_regret')
        self.assertTrue(ai_regrets.filter(application=self.app3).exists())

        # Second press must be refused with 409 Conflict
        res_double = self.client.post(f'/api/jobs/{self.job.id}/send/', {'send_regret': True})
        self.assertEqual(res_double.status_code, 409)
