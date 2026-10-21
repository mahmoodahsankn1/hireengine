import logging
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from accounts.models import User
from notifications.models import EmailLog

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def send_otp_email(self, user_id, otp_code):
    """
    Sends the 6-digit OTP verification email to the user.
    """
    try:
        user = User.objects.get(id=user_id)
        subject = "Your HireFlow Verification Code"
        message = (
            f"Hello {user.full_name},\n\n"
            f"Your HireFlow verification code is: {otp_code}\n\n"
            f"This code will expire in 10 minutes.\n"
            f"If you did not request this, please ignore this email.\n\n"
            f"Best regards,\nThe HireFlow Team"
        )
        
        # Log to EmailLog
        email_log = EmailLog.objects.create(
            recipient=user.email,
            kind='otp',
            status='queued'
        )
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        
        email_log.status = 'sent'
        email_log.sent_at = timezone.now()
        email_log.save(update_fields=['status', 'sent_at'])
        logger.info(f"OTP email sent successfully to {user.email}")
        return True

    except User.DoesNotExist:
        logger.error(f"User with id {user_id} not found when sending OTP")
        return False
    except Exception as exc:
        logger.error(f"Error sending OTP to user {user_id}: {exc}")
        if 'email_log' in locals():
            email_log.status = 'failed'
            email_log.attempts += 1
            email_log.error = str(exc)
            email_log.save(update_fields=['status', 'attempts', 'error'])
        raise self.retry(exc=exc)
