import logging
from celery import shared_task
from django.utils import timezone
from applications.models import Application
from applications.extractors import extract_resume_text, regex_strip_pii
from ai.services import anonymize_cv, score_cv

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_cv(self, application_id):
    """
    Celery task to process an uploaded CV:
    1. Extract plain text from PDF/DOCX (if needed)
    2. Regex-strip emails, phone numbers, and URLs
    3. Anonymize CV using AI LLM
    4. Score CV against job requirements using AI Rubric Scorer
    5. Save results and update processing_status to 'done' or 'failed'
    """
    try:
        application = Application.objects.select_related('job').get(id=application_id)
        
        # Skip if already done
        if application.processing_status == 'done':
            logger.info(f"Application {application_id} already processed. Skipping.")
            return True

        application.processing_attempts += 1
        application.save(update_fields=['processing_attempts'])

        # 1. Extract resume text from stored file
        try:
            with application.resume_file.open('rb') as f:
                raw_text = extract_resume_text(f, application.resume_file.name)
        except Exception as exc:
            logger.error(f"Failed to extract resume text for {application_id}: {exc}")
            application.processing_status = 'failed'
            application.save(update_fields=['processing_status'])
            return False

        # 2. Step 1 of anonymization: Regex-strip emails/phones/URLs
        cleaned_text = regex_strip_pii(raw_text)

        # 3. Step 2 of anonymization: LLM Anonymize
        anonymized_text = anonymize_cv(cleaned_text)
        application.anonymized_text = anonymized_text

        # 4. LLM Score against job details and required skills
        job = application.job
        score_data = score_cv(
            job_title=job.title,
            job_description=job.description,
            required_skills=job.required_skills,
            anonymized_cv=anonymized_text
        )

        application.cv_score = score_data['total']
        application.score_breakdown = score_data
        application.processing_status = 'done'
        application.save(update_fields=['anonymized_text', 'cv_score', 'score_breakdown', 'processing_status'])

        logger.info(f"Application {application_id} successfully scored: {application.cv_score}/100")
        return True

    except Application.DoesNotExist:
        logger.error(f"Application {application_id} not found in process_cv")
        return False
    except Exception as exc:
        logger.error(f"Error during CV processing for application {application_id}: {exc}")
        try:
            app = Application.objects.get(id=application_id)
            if self.request.retries >= self.max_retries or app.processing_attempts >= 3:
                app.processing_status = 'failed'
                app.save(update_fields=['processing_status'])
                logger.warning(f"Application {application_id} marked as failed after 3 attempts.")
                return False
        except Exception:
            pass
        raise self.retry(exc=exc, countdown=30)
