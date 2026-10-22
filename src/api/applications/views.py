import re
import logging
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import ScopedRateThrottle

from jobs.models import Job
from applications.models import Application
from applications.serializers import (
    PublicJobDetailSerializer,
    ApplicationPublicCreateSerializer,
    ApplicationBlindSerializer,
    ApplicationRevealedSerializer,
    POLICY_VERSION,
)
from applications.tasks import process_cv
from notifications.tasks import send_application_received_email

logger = logging.getLogger(__name__)

class PublicJobFormView(APIView):
    """
    GET /api/forms/<slug>/
    Public endpoint for candidates to inspect job details and apply.
    Returns 404 if job does not exist, is deleted, or is in 'draft' stage.
    Flags closed: True if deadline passed or stage is not collecting.
    """
    permission_classes = [AllowAny]

    def get(self, request, slug):
        try:
            job = Job.objects.select_related('hr').get(form_slug=slug, is_deleted=False)
        except Job.DoesNotExist:
            return Response(
                {"error": "Job application form not found or has expired."},
                status=status.HTTP_404_NOT_FOUND
            )

        if job.stage == 'draft':
            return Response(
                {"error": "This job posting has not been published yet."},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = PublicJobDetailSerializer(job)
        return Response(serializer.data, status=status.HTTP_200_OK)

class PublicApplyView(APIView):
    """
    POST /api/apply/<slug>/
    Public endpoint for candidate resume submission.
    Rate throttled (10/min) per SRS.
    Extracts text, validates format, enforces text-based files (>200 chars),
    prevents duplicate submissions, saves application and triggers CV processing.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'apply'
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, slug):
        try:
            job = Job.objects.select_related('hr').get(form_slug=slug, is_deleted=False)
        except Job.DoesNotExist:
            return Response(
                {"error": "Job not found or has expired."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if job is still accepting applications
        if job.stage != 'collecting':
            return Response(
                {"error": "Applications for this position are no longer being accepted."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if job.application_deadline <= timezone.now():
            return Response(
                {"error": "The deadline to apply for this position has passed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ApplicationPublicCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        raw_email = data['email']
        raw_phone = data['phone']

        # Normalization per Phase 3 rules
        email_normalized = raw_email.strip().lower()
        digits = re.sub(r'\D', '', raw_phone)
        phone_normalized = digits[-10:] if len(digits) >= 10 else digits

        # Check for duplicates
        if Application.objects.filter(job=job, email_normalized=email_normalized).exists():
            return Response(
                {"error": "An application with this email address has already been submitted for this position."},
                status=status.HTTP_409_CONFLICT
            )

        if Application.objects.filter(job=job, phone_normalized=phone_normalized).exists():
            return Response(
                {"error": "An application with this phone number has already been submitted for this position."},
                status=status.HTTP_409_CONFLICT
            )

        try:
            with transaction.atomic():
                application = Application.objects.create(
                    job=job,
                    full_name=data['full_name'].strip(),
                    email=raw_email.strip(),
                    phone=raw_phone.strip(),
                    email_normalized=email_normalized,
                    phone_normalized=phone_normalized,
                    resume_file=data['resume_file'],
                    consent_given=True,
                    consent_at=timezone.now(),
                    policy_version=POLICY_VERSION,
                    processing_status='pending',
                    pipeline_status='applied',
                    applied_at=timezone.now(),
                )

                # Queue async CV processing & confirmation email
                transaction.on_commit(lambda: process_cv.delay(str(application.id)))
                transaction.on_commit(lambda: send_application_received_email.delay(str(application.id)))

        except IntegrityError:
            return Response(
                {"error": "An application with this email or phone number has already been submitted for this position."},
                status=status.HTTP_409_CONFLICT
            )
        except Exception as exc:
            logger.error(f"Error creating application for {slug}: {exc}")
            return Response(
                {"error": "An unexpected error occurred while saving your application. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(
            {
                "message": "Application submitted successfully! Your resume is being processed.",
                "application_id": str(application.id),
                "job_title": job.title,
                "company_name": job.hr.company_name or "HireEngine",
            },
            status=status.HTTP_201_CREATED
        )

class ApplicationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    HR authenticated viewset for applications.
    Returns blind representation during early rounds (collecting, cv_review).
    Reveals candidate identity after Round 1 invitations are sent.
    Supports retry action for failed CV processing and advance action for review stages.
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        # Reveal candidate details only once job advances past cv_review
        job_id = self.request.query_params.get('job')
        if job_id:
            try:
                job = Job.objects.get(id=job_id, hr=self.request.user)
                if job.stage not in ('draft', 'collecting', 'cv_review'):
                    return ApplicationRevealedSerializer
            except (Job.DoesNotExist, ValueError):
                pass
        return ApplicationBlindSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Application.objects.filter(job__hr=user, job__is_deleted=False).select_related('job').prefetch_related('interviews__ai_result')
        
        job_id = self.request.query_params.get('job')
        if job_id:
            queryset = queryset.filter(job_id=job_id)

        # Order by rank, score descending, then application time
        return queryset.order_by('-cv_score', 'applied_at')

    @action(detail=True, methods=['patch'], url_path='advance')
    def advance(self, request, pk=None):
        """
        PATCH /api/applications/<id>/advance/
        Allows HR to toggle candidate advancement (advance_next: true | false)
        during review stages (cv_review, ai_review, hr_review).
        Enforces: total advancing count cannot exceed slot capacity.
        """
        app = self.get_object()
        job = app.job
        if job.hr != request.user:
            return Response({"error": "Unauthorized."}, status=status.HTTP_403_FORBIDDEN)

        if job.stage not in ('cv_review', 'ai_review', 'hr_review'):
            return Response(
                {"error": f"Candidates can only be adjusted during review stages. Current stage: '{job.stage}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        advance_val = request.data.get('advance_next')
        if advance_val is None:
            return Response(
                {"error": "'advance_next' field (boolean) is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        advance_next = bool(advance_val)

        if advance_next and not app.advance_next:
            from interviews.services import calculate_capacity
            if job.stage == 'cv_review':
                slot_capacity = calculate_capacity(job, 'ai')
            elif job.stage == 'ai_review':
                slot_capacity = calculate_capacity(job, 'hr')
            else:
                slot_capacity = 999999

            current_advancing = Application.objects.filter(job=job, advance_next=True).count()
            if current_advancing + 1 > slot_capacity:
                return Response(
                    {
                        "error": f"Cannot include candidate: available slot capacity ({slot_capacity}) would be exceeded.",
                        "slot_capacity": slot_capacity,
                        "current_advancing": current_advancing,
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

        app.advance_next = advance_next
        app.save(update_fields=['advance_next'])

        serializer_class = self.get_serializer_class()
        serializer = serializer_class(app, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='retry')
    def retry(self, request, pk=None):
        """
        Allows HR to retry CV processing for applications that failed (Needs Attention).
        """
        app = self.get_object()
        if app.job.hr != request.user:
            return Response({"error": "Unauthorized."}, status=status.HTTP_403_FORBIDDEN)

        if app.processing_status != 'failed':
            return Response(
                {"error": f"Cannot retry application with status '{app.processing_status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        app.processing_status = 'pending'
        app.save(update_fields=['processing_status'])

        process_cv.delay(str(app.id))

        return Response(
            {"message": "CV processing has been queued for re-evaluation.", "status": "pending"},
            status=status.HTTP_200_OK
        )

