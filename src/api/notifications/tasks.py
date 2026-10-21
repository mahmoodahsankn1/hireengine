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

def format_interview_datetime(dt, tz_name='Asia/Kolkata'):
    """
    Formats a datetime in the specified timezone with timezone label.
    """
    if not dt:
        return "TBD"
    import zoneinfo
    try:
        tz = zoneinfo.ZoneInfo(tz_name or 'Asia/Kolkata')
    except Exception:
        tz = zoneinfo.ZoneInfo('Asia/Kolkata')
    
    localized = dt.astimezone(tz)
    return localized.strftime("%A, %d %B %Y at %I:%M %p") + f" ({tz_name or 'Asia/Kolkata'})"

@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def send_round_finished_hr_email(self, job_id, round_number):
    """
    Automatic email to HR when a round completes (e.g. deadline passes for CV review).
    """
    from jobs.models import Job
    try:
        job = Job.objects.select_related('hr').get(id=job_id)
        hr = job.hr
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://hireengine.vercel.app').rstrip('/')
        job_url = f"{frontend_url}/jobs/{job.id}"

        subject = f"Round {round_number} Finished: Review Candidates for {job.title}"
        if round_number == 1:
            stage_desc = "The application deadline has passed and all submitted CVs have been evaluated."
        elif round_number == 2:
            stage_desc = "All AI candidate interviews have been completed and scored."
        else:
            stage_desc = "All HR interviews have been completed."

        message = (
            f"Hello {hr.full_name},\n\n"
            f"Round {round_number} for your job opening '{job.title}' is now complete!\n\n"
            f"{stage_desc}\n\n"
            f"You can now review candidate rankings, inspect evaluations, and send interview invitations:\n"
            f"{job_url}\n\n"
            f"Best regards,\n"
            f"The HireFlow Team"
        )

        email_log = EmailLog.objects.create(
            recipient=hr.email,
            kind='round_finished_hr',
            job=job,
            status='queued'
        )

        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[hr.email],
            fail_silently=False,
        )

        email_log.status = 'sent'
        email_log.sent_at = timezone.now()
        email_log.save(update_fields=['status', 'sent_at'])
        logger.info(f"Round {round_number} notification sent to HR {hr.email}")
        return True

    except Job.DoesNotExist:
        logger.error(f"Job {job_id} not found when sending HR round notification")
        return False
    except Exception as exc:
        logger.error(f"Error sending round notification to HR for job {job_id}: {exc}")
        if 'email_log' in locals() and email_log:
            email_log.status = 'failed'
            email_log.attempts += 1
            email_log.error = str(exc)
            email_log.save(update_fields=['status', 'attempts', 'error'])
        raise self.retry(exc=exc)

@shared_task(bind=True, max_retries=3, default_retry_delay=15)
def send_email_task(self, email_log_id):
    """
    Worker task to deliver queued candidate emails (AI invite, regret, HR invite, final).
    Formats date/time with HR timezone name, link, join-early and grace rules.
    """
    from interviews.models import Interview
    try:
        email_log = EmailLog.objects.select_related('job', 'job__hr', 'application').get(id=email_log_id)
        if email_log.status == 'sent':
            return True

        app = email_log.application
        job = email_log.job or (app.job if app else None)
        hr = job.hr if job else None
        company_name = hr.company_name if hr and hr.company_name else "Our Hiring Team"
        tz_name = hr.timezone if hr and hr.timezone else 'Asia/Kolkata'
        frontend_url = getattr(settings, 'FRONTEND_URL', 'https://hireengine.vercel.app').rstrip('/')

        kind = email_log.kind
        subject = ""
        message = ""

        # Fetch scheduled interview if kind is an invitation
        interview = None
        if kind in ('ai_invite', 'hr_invite') and app:
            intv_kind = 'ai' if kind == 'ai_invite' else 'hr'
            interview = Interview.objects.filter(application=app, kind=intv_kind).first()

        if kind == 'ai_invite':
            if not interview:
                raise ValueError(f"No AI interview record found for application {app.id}")

            dt_formatted = format_interview_datetime(interview.start_at, tz_name)
            link = f"{frontend_url}/interview/ai/{interview.access_token}"

            subject = f"Interview Invitation: AI Round for {job.title} at {company_name}"
            message = (
                f"Dear {app.full_name},\n\n"
                f"Congratulations! Based on your qualifications, we are pleased to invite you to "
                f"the AI Interview Round for the position of {job.title} at {company_name}.\n\n"
                f"--- INTERVIEW DETAILS ---\n"
                f"• Scheduled Time: {dt_formatted}\n"
                f"• Duration: {job.ai_duration_minutes} minutes\n"
                f"• Interview Link: {link}\n\n"
                f"--- IMPORTANT RULES ---\n"
                f"1. Waiting Room: You may join the waiting room up to {job.ai_join_early_minutes} minutes early "
                f"to test your microphone and verify your connection.\n"
                f"2. Strict Access: The interview access closes {job.ai_late_grace_minutes} minutes after the start time. "
                f"Late arrivals will not be admitted.\n"
                f"3. Environment: Please ensure you are in a quiet room with a stable internet connection and microphone.\n\n"
                f"Best of luck!\n\n"
                f"Warm regards,\n"
                f"{company_name} Hiring Team\n"
                f"Powered by HireFlow"
            )

        elif kind == 'ai_regret':
            subject = f"Update on your application for {job.title} at {company_name}"
            message = (
                f"Dear {app.full_name},\n\n"
                f"Thank you for your interest in {company_name} and for taking the time to apply for "
                f"the position of {job.title}.\n\n"
                f"After careful review of all applications against our current requirements, we regret to inform "
                f"you that we will not be moving forward with your candidacy for this role.\n\n"
                f"We received many competitive applications and faced very difficult decisions. We appreciate your time "
                f"and wish you the very best in your career pursuits.\n\n"
                f"Sincerely,\n"
                f"{company_name} Hiring Team"
            )

        elif kind == 'hr_invite':
            if not interview:
                raise ValueError(f"No HR interview record found for application {app.id}")

            dt_formatted = format_interview_datetime(interview.start_at, tz_name)
            link = f"{frontend_url}/interview/hr/{interview.access_token}"

            subject = f"Interview Invitation: Final Video Round for {job.title} at {company_name}"
            message = (
                f"Dear {app.full_name},\n\n"
                f"Congratulations on your performance in the previous round! We are delighted to invite you to "
                f"the HR & Technical Video Interview for the {job.title} position at {company_name}.\n\n"
                f"--- INTERVIEW DETAILS ---\n"
                f"• Scheduled Time: {dt_formatted}\n"
                f"• Duration: {job.hr_duration_minutes} minutes\n"
                f"• Meeting Link: {link}\n\n"
                f"--- INSTRUCTIONS ---\n"
                f"• You may join up to {job.hr_join_early_minutes} minutes early to test your camera and audio.\n"
                f"• Please have your webcam and microphone active.\n\n"
                f"We look forward to meeting you!\n\n"
                f"Warm regards,\n"
                f"{company_name} Hiring Team"
            )

        elif kind == 'hr_regret':
            subject = f"Update regarding your interview for {job.title} at {company_name}"
            message = (
                f"Dear {app.full_name},\n\n"
                f"Thank you for participating in the AI interview for the {job.title} role at {company_name}.\n\n"
                f"After evaluating the interview results, we regret to inform you that you have not been selected "
                f"for the next round. We truly appreciate the time and effort you dedicated to our selection process.\n\n"
                f"We wish you every success in your future endeavors.\n\n"
                f"Sincerely,\n"
                f"{company_name} Hiring Team"
            )

        elif kind == 'final_selected':
            subject = f"Congratulations! Selection for {job.title} at {company_name}"
            message = (
                f"Dear {app.full_name},\n\n"
                f"We are thrilled to inform you that you have been selected for the position of {job.title} "
                f"at {company_name}!\n\n"
                f"Our team was thoroughly impressed by your skills, experience, and performance throughout all "
                f"rounds of our interview process.\n\n"
                f"Our HR team will follow up with you shortly regarding the formal offer details and next steps.\n\n"
                f"Congratulations once again, and welcome aboard!\n\n"
                f"Warm regards,\n"
                f"{company_name} Hiring Team"
            )

        elif kind == 'final_rejected':
            subject = f"Final Selection Decision: {job.title} at {company_name}"
            message = (
                f"Dear {app.full_name},\n\n"
                f"Thank you for attending the final interview for the {job.title} position at {company_name}.\n\n"
                f"After careful deliberation among our interview panel, we regret to share that we have decided to move "
                f"forward with another candidate whose background more closely matched our specific immediate needs.\n\n"
                f"We sincerely thank you for your enthusiasm and dedication, and wish you all the best in your career.\n\n"
                f"Sincerely,\n"
                f"{company_name} Hiring Team"
            )

        else:
            raise ValueError(f"Unknown email kind: {kind}")

        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email_log.recipient],
            fail_silently=False,
        )

        email_log.status = 'sent'
        email_log.sent_at = timezone.now()
        email_log.save(update_fields=['status', 'sent_at'])
        logger.info(f"Email {kind} sent successfully to {email_log.recipient}")
        return True

    except Exception as exc:
        logger.error(f"Error sending email log {email_log_id}: {exc}")
        if 'email_log' in locals() and email_log:
            email_log.status = 'failed'
            email_log.attempts += 1
            email_log.error = str(exc)
            email_log.save(update_fields=['status', 'attempts', 'error'])
        raise self.retry(exc=exc)

def queue_application_email(application, kind, job=None):
    """
    Safely creates or fetches EmailLog for (application, kind) and queues send_email_task.
    Enforces uniqueness per application and kind.
    """
    job = job or application.job
    email_log, created = EmailLog.objects.get_or_create(
        application=application,
        kind=kind,
        defaults={
            'recipient': application.email,
            'job': job,
            'status': 'queued',
        }
    )

    # If already sent, do not duplicate
    if not created and email_log.status == 'sent':
        return email_log

    send_email_task.delay(str(email_log.id))
    return email_log

