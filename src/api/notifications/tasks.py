import logging
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from accounts.models import User
from applications.models import Application
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

@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def send_application_received_email(self, application_id):
    """
    Sends automatic application confirmation email to the candidate upon submission.
    Idempotent: will not duplicate if already sent.
    """
    try:
        application = Application.objects.select_related('job', 'job__hr').get(id=application_id)
        
        # Prevent duplicate emails
        email_log, created = EmailLog.objects.get_or_create(
            application=application,
            kind='application_received',
            defaults={
                'recipient': application.email,
                'job': application.job,
                'status': 'queued',
            }
        )

        if not created and email_log.status == 'sent':
            logger.info(f"Application received email already sent for application {application_id}")
            return True

        company_name = application.job.hr.company_name or "Our Hiring Team"
        subject = f"Application Received: {application.job.title} at {company_name}"
        message = (
            f"Dear {application.full_name},\n\n"
            f"Thank you for applying for the role of {application.job.title} at {company_name}.\n\n"
            f"We have received your application successfully. Your resume is being processed and "
            f"anonymized before evaluation by our recruitment team.\n\n"
            f"We will be in touch with updates as your application progresses through our evaluation pipeline.\n\n"
            f"Best regards,\n"
            f"{company_name} Recruitment Team\n"
            f"Powered by HireFlow"
        )

        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[application.email],
            fail_silently=False,
        )

        email_log.status = 'sent'
        email_log.sent_at = timezone.now()
        email_log.save(update_fields=['status', 'sent_at'])
        logger.info(f"Application received confirmation sent to {application.email}")
        return True

    except Application.DoesNotExist:
        logger.error(f"Application {application_id} not found when sending confirmation email")
        return False
    except Exception as exc:
        logger.error(f"Error sending application received email to app {application_id}: {exc}")
        if 'email_log' in locals() and email_log:
            email_log.status = 'failed'
            email_log.attempts += 1
            email_log.error = str(exc)
            email_log.save(update_fields=['status', 'attempts', 'error'])
        raise self.retry(exc=exc)
