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
        # A window starting only 30 minutes in the future should not yield slots earlier than now + 60 min
        early_window = AvailabilityWindow.objects.create(
            job=self.job,
            round=2,
            start_at=self.now + timedelta(minutes=15),
            end_at=self.now + timedelta(minutes=90),
        )
        slots = generate_slots(self.job, 'ai', windows_override=[early_window], current_time=self.now)
        # Earliest slot must be >= now + 60 mins
        for s in slots:
            self.assertGreaterEqual(s, self.now + timedelta(minutes=60))

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
