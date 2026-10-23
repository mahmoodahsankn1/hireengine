import uuid
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from jobs.models import Job, AvailabilityWindow
from applications.models import Application
from interviews.models import Interview
from interviews.services import generate_slots, calculate_capacity, allocate, NotEnoughSlots

class InterviewAllocatorTests(TestCase):
    def setUp(self):
        self.hr = User.objects.create_user(
            email='hr_alloc@example.com',
            password='Password123!',
            full_name='HR Allocator',
            company_name='Alloc Corp',
            is_email_verified=True,
            timezone='Asia/Kolkata',
        )
        self.now = timezone.now()

        # Job with AI window starting 2 hours in future
        self.job = Job.objects.create(
            hr=self.hr,
            title='Python Engineer',
            form_slug='python-eng-slug-1',
            description='Test JD',
            required_skills=[{"skill": "Python", "level": "must"}],
            application_deadline=self.now + timedelta(hours=1),
            ai_shortlist_count=3,
            final_shortlist_count=2,
            ai_duration_minutes=5,
            ai_buffer_minutes=3,
            ai_join_early_minutes=5,
            ai_late_grace_minutes=2,
            hr_duration_minutes=30,
            hr_buffer_minutes=5,
            hr_join_early_minutes=5,
            stage='cv_review',
        )

        # Round 2 AI Availability Window: 2 hours to 4 hours from now
        self.ai_window = AvailabilityWindow.objects.create(
            job=self.job,
            round=2,
            start_at=self.now + timedelta(hours=2),
            end_at=self.now + timedelta(hours=2, minutes=40),  # 40 mins = 5 slots of (5+3) mins
        )

        # Create 3 candidate applications
        self.app1 = Application.objects.create(
            job=self.job,
            full_name='Candidate One',
            email='c1@example.com',
            phone='+919876543210',
            email_normalized='c1@example.com',
            phone_normalized='9876543210',
            cv_score=95,
            cv_rank=1,
            advance_next=True,
            processing_status='done',
        )
        self.app2 = Application.objects.create(
            job=self.job,
            full_name='Candidate Two',
            email='c2@example.com',
            phone='+919876543211',
            email_normalized='c2@example.com',
            phone_normalized='9876543211',
            cv_score=88,
            cv_rank=2,
            advance_next=True,
            processing_status='done',
        )
        self.app3 = Application.objects.create(
            job=self.job,
            full_name='Candidate Three',
            email='c3@example.com',
            phone='+919876543212',
            email_normalized='c3@example.com',
            phone_normalized='9876543212',
            cv_score=82,
            cv_rank=3,
            advance_next=True,
            processing_status='done',
        )

    def test_generate_slots_timing_and_buffer(self):
        slots = generate_slots(self.job, 'ai', current_time=self.now)
        # 40 mins window, each slot = 5 min dur + 3 min buf = 8 mins. 40 / 8 = 5 slots
        self.assertEqual(len(slots), 5)
        # Check first slot starts at window start (which is >= now + 60 mins)
        self.assertEqual(slots[0], self.ai_window.start_at)
        # Check second slot is exactly 8 minutes after first slot
        self.assertEqual(slots[1], slots[0] + timedelta(minutes=8))

    def test_earliest_slot_rule(self):
        # A window starting only 30 seconds in the future should not yield slots earlier than now + 1 min
        early_window = AvailabilityWindow.objects.create(
            job=self.job,
            round=2,
            start_at=self.now + timedelta(seconds=30),
            end_at=self.now + timedelta(minutes=90),
        )
        slots = generate_slots(self.job, 'ai', windows_override=[early_window], current_time=self.now)
        # Earliest slot must be >= now + 1 min (grace period)
        for s in slots:
            self.assertGreaterEqual(s, self.now + timedelta(minutes=1))

    def test_allocate_successful_and_rank_ordered(self):
        apps = [self.app1, self.app2, self.app3]
        interviews = allocate(self.job, 'ai', apps, current_time=self.now)

        self.assertEqual(len(interviews), 3)
        # Verify rank ordering: App 1 (rank 1) gets earliest slot, App 2 gets second, etc.
        self.assertEqual(interviews[0].application, self.app1)
        self.assertEqual(interviews[1].application, self.app2)
        self.assertEqual(interviews[2].application, self.app3)
        self.assertLess(interviews[0].start_at, interviews[1].start_at)
        self.assertLess(interviews[1].start_at, interviews[2].start_at)

        # Verify Interview fields
        intv1 = interviews[0]
        self.assertEqual(intv1.job, self.job)
        self.assertEqual(intv1.hr, self.hr)
        self.assertEqual(intv1.kind, 'ai')
        self.assertEqual(intv1.duration_minutes, 5)
        self.assertEqual(intv1.reserved_until, intv1.start_at + timedelta(minutes=8))
        self.assertEqual(intv1.join_opens_at, intv1.start_at - timedelta(minutes=5))
        self.assertEqual(intv1.join_closes_at, intv1.start_at + timedelta(minutes=2))
        self.assertTrue(len(intv1.access_token) >= 32)
        self.assertEqual(intv1.status, 'scheduled')

    def test_allocate_insufficient_slots_raises_exception(self):
        # Window with only 1 slot: 8 minutes
        small_window = AvailabilityWindow.objects.create(
            job=self.job,
            round=2,
            start_at=self.now + timedelta(hours=3),
            end_at=self.now + timedelta(hours=3, minutes=8),
        )
        self.job.availability_windows.filter(id=self.ai_window.id).delete()
        apps = [self.app1, self.app2, self.app3]

        with self.assertRaises(NotEnoughSlots) as ctx:
            allocate(self.job, 'ai', apps, current_time=self.now)
        # 1 slot available, 3 apps -> shortfall = 2
        self.assertEqual(ctx.exception.shortfall, 2)

    def test_clash_prevention_across_jobs_for_same_hr(self):
        # First allocate app1
        allocate(self.job, 'ai', [self.app1], current_time=self.now)
        intv1 = Interview.objects.get(application=self.app1)

        # Now check available slots for a second job owned by the SAME HR
        job2 = Job.objects.create(
            hr=self.hr,
            title='Second Job',
            form_slug='second-job-slug-2',
            description='JD2',
            required_skills=[{"skill": "React", "level": "must"}],
            application_deadline=self.now + timedelta(hours=1),
            ai_shortlist_count=2,
            final_shortlist_count=1,
            stage='cv_review',
        )
        AvailabilityWindow.objects.create(
            job=job2,
            round=2,
            start_at=self.ai_window.start_at,
            end_at=self.ai_window.end_at,
        )

        slots_job2 = generate_slots(job2, 'ai', current_time=self.now)
        # The slot that overlaps with intv1 must NOT be in slots_job2!
        self.assertNotIn(intv1.start_at, slots_job2)
        # Only 4 slots remain available instead of 5
        self.assertEqual(len(slots_job2), 4)


class Phase5AIInterviewTests(TestCase):
    def setUp(self):
        self.hr = User.objects.create_user(
            email='hr_phase5@example.com',
            password='Password123!',
            full_name='HR Interviewer',
            company_name='AI Tech Ltd',
            is_email_verified=True,
            timezone='Asia/Kolkata',
        )
        self.now = timezone.now()

        self.job = Job.objects.create(
            hr=self.hr,
            title='Full Stack AI Engineer',
            form_slug='fs-ai-engineer-slug',
            description='Build next-gen AI platforms using Python, Django, React, and OpenAI.',
            required_skills=[
                {"skill": "Python", "level": "must"},
                {"skill": "React", "level": "nice"}
            ],
            application_deadline=self.now - timedelta(hours=2),
            ai_shortlist_count=3,
            final_shortlist_count=2,
            ai_interview_prompt="Focus on system design and asynchronous processing.",
            ai_duration_minutes=5,
            ai_buffer_minutes=3,
            ai_join_early_minutes=5,
            ai_late_grace_minutes=2,
            stage='ai_interview',
        )

        self.app1 = Application.objects.create(
            job=self.job,
            full_name='Alice Smith',
            email='alice@example.com',
            phone='+919000000001',
            email_normalized='alice@example.com',
            phone_normalized='9000000001',
            cv_score=92,
            cv_rank=1,
            pipeline_status='ai_invited',
            advance_next=False,
            anonymized_text='Extensive Python and Django backend experience with scalable architectures.',
            applied_at=self.now - timedelta(days=2),
        )

        self.app2 = Application.objects.create(
            job=self.job,
            full_name='Bob Jones',
            email='bob@example.com',
            phone='+919000000002',
            email_normalized='bob@example.com',
            phone_normalized='9000000002',
            cv_score=88,
            cv_rank=2,
            pipeline_status='ai_invited',
            advance_next=False,
            anonymized_text='React and frontend developer with REST API integration background.',
            applied_at=self.now - timedelta(days=1),
        )

        # AI Interview for Alice: scheduled right now
        self.intv1 = Interview.objects.create(
            job=self.job,
            application=self.app1,
            hr=self.hr,
            kind='ai',
            start_at=self.now,
            duration_minutes=5,
            reserved_until=self.now + timedelta(minutes=8),
            join_opens_at=self.now - timedelta(minutes=5),
            join_closes_at=self.now + timedelta(minutes=2),
            access_token='token_alice_ai_valid_32_chars_ok',
            status='scheduled',
        )

    def test_ai_interview_info_endpoint(self):
        resp = self.client.get(f'/api/ai-interview/{self.intv1.access_token}/info/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['status'], 'scheduled')
        self.assertEqual(data['job_title'], 'Full Stack AI Engineer')
        self.assertEqual(data['company_name'], 'AI Tech Ltd')
        self.assertTrue(data['can_start'])

    def test_ai_interview_start_early_blocked(self):
        # Move start_at to 10 minutes in future
        self.intv1.start_at = self.now + timedelta(minutes=10)
        self.intv1.reserved_until = self.now + timedelta(minutes=18)
        self.intv1.join_opens_at = self.now + timedelta(minutes=5)
        self.intv1.join_closes_at = self.now + timedelta(minutes=12)
        self.intv1.save()

        resp = self.client.post(f'/api/ai-interview/{self.intv1.access_token}/start/')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Interview has not started yet', resp.json().get('error', ''))

    def test_ai_interview_start_late_marks_no_show(self):
        # Move join_closes_at to the past
        self.intv1.start_at = self.now - timedelta(minutes=10)
        self.intv1.reserved_until = self.now - timedelta(minutes=2)
        self.intv1.join_opens_at = self.now - timedelta(minutes=15)
        self.intv1.join_closes_at = self.now - timedelta(minutes=8)
        self.intv1.save()

        resp = self.client.post(f'/api/ai-interview/{self.intv1.access_token}/start/')
        self.assertEqual(resp.status_code, 400)
        self.intv1.refresh_from_db()
        self.assertEqual(self.intv1.status, 'no_show')

    def test_ai_interview_start_success_and_reconnect(self):
        # Start successfully inside join window
        resp = self.client.post(f'/api/ai-interview/{self.intv1.access_token}/start/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('key', data)
        self.assertIn('ends_at', data)
        self.assertEqual(data['status'], 'in_progress')

        self.intv1.refresh_from_db()
        self.assertEqual(self.intv1.status, 'in_progress')
        self.assertIsNotNone(self.intv1.started_at)

        # Reconnect test: calling start again while in_progress
        resp_reconnect = self.client.post(f'/api/ai-interview/{self.intv1.access_token}/start/')
        self.assertEqual(resp_reconnect.status_code, 200)
        self.assertEqual(resp_reconnect.json()['ends_at'], data['ends_at'])

    def test_ai_interview_finish_empty_marks_incomplete(self):
        self.intv1.status = 'in_progress'
        self.intv1.started_at = self.now
        self.intv1.save()

        # Finish with empty transcript
        resp = self.client.post(
            f'/api/ai-interview/{self.intv1.access_token}/finish/',
            data={"transcript": []},
            content_type='application/json'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['status'], 'incomplete')

        self.intv1.refresh_from_db()
        self.assertEqual(self.intv1.status, 'incomplete')

    def test_ai_interview_finish_with_only_interviewer_turn_marks_incomplete(self):
        self.intv1.status = 'in_progress'
        self.intv1.started_at = self.now
        self.intv1.save()

        resp = self.client.post(
            f'/api/ai-interview/{self.intv1.access_token}/finish/',
            data={"transcript": [{"speaker": "assistant", "text": "Can you introduce yourself?"}]},
            content_type='application/json'
        )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['status'], 'incomplete')

        self.intv1.refresh_from_db()
        self.assertEqual(self.intv1.status, 'incomplete')

    def test_ai_interview_finish_with_transcript_scores_and_completes(self):
        from interviews.models import AIResult
        from interviews.tasks import score_interview_task

        self.intv1.status = 'in_progress'
        self.intv1.started_at = self.now
        self.intv1.save()

        sample_transcript = [
            {"speaker": "assistant", "text": "Welcome Alice. Can you explain your experience with Python and asynchronous workers?", "time": self.now.isoformat()},
            {"speaker": "user", "text": "I have built large-scale Celery task pipelines and Django REST architectures handling asynchronous data feeds.", "time": self.now.isoformat(), "response_duration_seconds": 42},
            {"speaker": "assistant", "text": "Great. How do you handle database race conditions?", "time": self.now.isoformat()},
            {"speaker": "user", "text": "I use select_for_update inside atomic database transactions and PostgreSQL exclusion constraints.", "time": self.now.isoformat(), "response_duration_seconds": 18}
        ]

        resp = self.client.post(
            f'/api/ai-interview/{self.intv1.access_token}/finish/',
            data={"transcript": sample_transcript},
            content_type='application/json'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['status'], 'completed')

        self.intv1.refresh_from_db()
        self.assertEqual(self.intv1.status, 'completed')

        ai_result = AIResult.objects.get(interview=self.intv1)
        self.assertIsNotNone(ai_result)
        self.assertEqual(len(ai_result.transcript['turns']), 4)
        self.assertEqual(ai_result.transcript['turns'][1]['response_duration_seconds'], 42)
        self.assertGreater(ai_result.transcript['total_duration_seconds'], 0)
        self.assertEqual(ai_result.transcript['candidate_response_count'], 2)

        # Run scoring task
        score_interview_task(str(ai_result.id))
        ai_result.refresh_from_db()
        self.assertEqual(ai_result.scoring_status, 'done')
        self.assertGreater(ai_result.score, 0)
        self.assertIn('scores', ai_result.score_breakdown)
        self.assertIn('technical', ai_result.score_breakdown['scores'])
        self.assertIn('justification', ai_result.score_breakdown)

    def test_hr_interview_feedback_requires_and_saves_rating(self):
        from rest_framework.test import APIClient
        from interviews.models import Feedback

        interview = Interview.objects.create(
            job=self.job,
            application=self.app1,
            hr=self.hr,
            kind='hr',
            start_at=self.now,
            duration_minutes=30,
            reserved_until=self.now + timedelta(minutes=35),
            join_opens_at=self.now - timedelta(minutes=5),
            join_closes_at=self.now + timedelta(minutes=30),
            access_token='token_alice_hr_feedback',
            status='in_progress',
            started_at=self.now,
        )
        client = APIClient()
        client.force_authenticate(user=self.hr)

        missing_rating = client.post(
            f'/api/interviews/{interview.id}/feedback/',
            {'decision': 'selected', 'notes': 'Strong communication'},
            format='json'
        )
        self.assertEqual(missing_rating.status_code, 400)
        self.assertFalse(Feedback.objects.filter(interview=interview).exists())

        saved_feedback = client.post(
            f'/api/interviews/{interview.id}/feedback/',
            {'decision': 'selected', 'rating': 8, 'notes': 'Strong communication'},
            format='json'
        )
        self.assertEqual(saved_feedback.status_code, 201)
        self.assertEqual(Feedback.objects.get(interview=interview).rating, 8)

    def test_beat_mark_no_shows(self):
        from interviews.tasks import mark_no_shows

        # AI scheduled past join_closes_at
        self.intv1.join_closes_at = self.now - timedelta(minutes=5)
        self.intv1.save()

        # Another interview in_progress past ends_at + 2 min
        intv2 = Interview.objects.create(
            job=self.job,
            application=self.app2,
            hr=self.hr,
            kind='ai',
            start_at=self.now - timedelta(minutes=20),
            duration_minutes=5,
            reserved_until=self.now,
            join_opens_at=self.now - timedelta(minutes=25),
            join_closes_at=self.now - timedelta(minutes=18),
            access_token='token_bob_ai_in_prog_overdue',
            status='in_progress',
            started_at=self.now - timedelta(minutes=15),
        )

        mark_no_shows()

        self.intv1.refresh_from_db()
        intv2.refresh_from_db()

        self.assertEqual(self.intv1.status, 'no_show')
        self.assertEqual(intv2.status, 'incomplete')

    def test_beat_check_round2_complete_advances_stage(self):
        from interviews.models import AIResult
        from interviews.tasks import check_round2_complete
        from jobs.models import JobRound

        # Set up Alice completed with high score (85)
        self.intv1.status = 'completed'
        self.intv1.save()
        AIResult.objects.create(
            interview=self.intv1,
            transcript=[{"speaker": "user", "text": "High score answer"}],
            score=85,
            scoring_status='done'
        )

        # Set up Bob completed with score (70) at a non-overlapping slot
        intv2 = Interview.objects.create(
            job=self.job,
            application=self.app2,
            hr=self.hr,
            kind='ai',
            start_at=self.now + timedelta(minutes=10),
            duration_minutes=5,
            reserved_until=self.now + timedelta(minutes=18),
            join_opens_at=self.now + timedelta(minutes=5),
            join_closes_at=self.now + timedelta(minutes=12),
            access_token='token_bob_ai_completed',
            status='completed',
        )
        AIResult.objects.create(
            interview=intv2,
            transcript=[{"speaker": "user", "text": "Solid answer"}],
            score=70,
            scoring_status='done'
        )

        # Run check_round2_complete
        check_round2_complete()

        self.job.refresh_from_db()
        self.assertEqual(self.job.stage, 'ai_review')

        # Alice should be marked advance_next=True (final_shortlist_count=2, so both advance)
        self.app1.refresh_from_db()
        self.app2.refresh_from_db()
        self.assertTrue(self.app1.advance_next)
        self.assertTrue(self.app2.advance_next)

        # JobRound 2 should be marked completed
        round2 = JobRound.objects.get(job=self.job, round=2)
        self.assertIsNotNone(round2.completed_at)
        self.assertIsNotNone(round2.hr_notified_at)
