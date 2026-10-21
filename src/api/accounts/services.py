import secrets
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth.hashers import make_password, check_password
from rest_framework.exceptions import ValidationError
from accounts.models import User, EmailOTP
from notifications.tasks import send_otp_email

def generate_and_send_otp(user: User) -> str:
    """
    Generates a 6-digit OTP, stores its hash with a 10-minute expiry in EmailOTP,
    and dispatches a Celery task to email the user.
    """
    code = f"{secrets.randbelow(10**6):06d}"
    code_hash = make_password(code)
    expires_at = timezone.now() + timedelta(minutes=10)

    EmailOTP.objects.create(
        user=user,
        code_hash=code_hash,
        expires_at=expires_at
    )

    try:
        send_otp_email.delay(str(user.id), code)
    except Exception:
        # Fallback in environments where Celery worker/broker isn't active
        try:
            send_otp_email(str(user.id), code)
        except Exception:
            pass

    return code

def verify_otp(email: str, code: str) -> User:
    """
    Verifies the OTP for the given email.
    Enforces expiry, attempts <= 5, sets is_email_verified and used_at.
    """
    try:
        user = User.objects.get(email=email.strip().lower())
    except User.DoesNotExist:
        raise ValidationError({"error": "User with this email does not exist."})

    otp = EmailOTP.objects.filter(user=user, used_at__isnull=True).order_by('-created_at').first()

    if not otp:
        raise ValidationError({"error": "No active verification code found. Please request a new code."})

    if otp.expires_at < timezone.now():
        raise ValidationError({"error": "Verification code has expired. Please request a new one."})

    if otp.attempts >= 5:
        raise ValidationError({"error": "Too many failed attempts. Please request a new code."})

    if not check_password(code, otp.code_hash):
        otp.attempts += 1
        otp.save(update_fields=['attempts'])
        remaining = 5 - otp.attempts
        raise ValidationError({"error": f"Invalid verification code. {remaining} attempt(s) remaining."})

    # Code is valid
    otp.used_at = timezone.now()
    otp.save(update_fields=['used_at'])

    user.is_email_verified = True
    user.save(update_fields=['is_email_verified'])

    return user

def resend_otp(email: str) -> str:
    """
    Resends OTP if at least 60 seconds have elapsed since the last OTP creation.
    """
    try:
        user = User.objects.get(email=email.strip().lower())
    except User.DoesNotExist:
        raise ValidationError({"error": "User with this email does not exist."})

    if user.is_email_verified:
        raise ValidationError({"error": "Email is already verified."})

    last_otp = EmailOTP.objects.filter(user=user).order_by('-created_at').first()
    if last_otp:
        elapsed = (timezone.now() - last_otp.created_at).total_seconds()
        if elapsed < 60:
            remaining_seconds = int(60 - elapsed)
            raise ValidationError({
                "error": f"Please wait {remaining_seconds} seconds before requesting a new code.",
                "retry_after": remaining_seconds
            })

    return generate_and_send_otp(user)

