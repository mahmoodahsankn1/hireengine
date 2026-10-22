from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User, EmailOTP
from accounts.services import generate_and_send_otp, verify_otp, resend_otp

class AccountAndOTPTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.email = 'hr_test@hireengine.dev'
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(
            email=self.email,
            password=self.password,
            full_name='Test HR',
            company_name='Test Org',
            is_email_verified=False,
        )

    def test_unverified_user_cannot_login(self):
        # Attempt login before OTP verification
        res = self.client.post('/api/auth/login/', {
            'email': self.email,
            'password': self.password,
        })
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('verify', str(res.data).lower())

    def test_otp_generation_and_successful_verification(self):
        code = generate_and_send_otp(self.user)
        self.assertEqual(len(code), 6)

        # Verify via API endpoint
        res = self.client.post('/api/auth/verify-otp/', {
            'email': self.email,
            'code': code,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)

        # Check DB state
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)

        # Now login should succeed
        login_res = self.client.post('/api/auth/login/', {
            'email': self.email,
            'password': self.password,
        })
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.assertIn('access', login_res.data)

    def test_otp_wrong_code_and_5_fails_lockout(self):
        code = generate_and_send_otp(self.user)
        wrong_code = '000000' if code != '000000' else '111111'

        # Test service layer 5 failed attempts lockout directly
        from rest_framework.exceptions import ValidationError
        for attempt in range(1, 6):
            with self.assertRaises(ValidationError) as ctx:
                verify_otp(self.email, wrong_code)
            otp = EmailOTP.objects.filter(user=self.user, used_at__isnull=True).latest('created_at')
            self.assertEqual(otp.attempts, min(attempt, 5))

        # 6th attempt even with correct code must now be refused with lockout message
        with self.assertRaises(ValidationError) as ctx:
            verify_otp(self.email, code)
        self.assertIn('too many failed attempts', str(ctx.exception).lower())

    def test_otp_expired_code_rejected(self):
        code = generate_and_send_otp(self.user)
        # Manually expire the OTP
        otp = EmailOTP.objects.filter(user=self.user).latest('created_at')
        otp.expires_at = timezone.now() - timedelta(minutes=1)
        otp.save()

        res = self.client.post('/api/auth/verify-otp/', {
            'email': self.email,
            'code': code,
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expired', str(res.data).lower())

    def test_otp_resend_cooldown_60s(self):
        generate_and_send_otp(self.user)

        # Immediate resend attempt (<60s) -> rejected
        res = self.client.post('/api/auth/resend-otp/', {'email': self.email})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('wait', str(res.data).lower())

        # Age the previous OTP by 61 seconds
        otp = EmailOTP.objects.filter(user=self.user).latest('created_at')
        EmailOTP.objects.filter(id=otp.id).update(created_at=timezone.now() - timedelta(seconds=65))

        # Now resend should succeed
        res_ok = self.client.post('/api/auth/resend-otp/', {'email': self.email})
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
