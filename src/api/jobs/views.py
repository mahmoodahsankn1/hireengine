from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from jobs.models import Job, JobRound
from jobs.serializers import JobSerializer
from applications.models import Application
from interviews.models import Interview
from interviews.services import calculate_capacity

class JobViewSet(viewsets.ModelViewSet):
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Job.objects.filter(hr=self.request.user, is_deleted=False)
            .prefetch_related('availability_windows', 'applications')
            .order_by('-created_at')
        )

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])

    @action(detail=True, methods=['post'], url_path='publish')
    def publish(self, request, pk=None):
        job = self.get_object()

        if job.stage != 'draft':
            return Response(
                {"error": f"Job cannot be published because it is currently in '{job.stage}' stage."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if job.application_deadline <= timezone.now():
            return Response(
                {"error": "Cannot publish job: Application deadline has already passed. Please update the deadline."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check capacity
        capacities = calculate_capacity(job)
        if capacities['ai_capacity'] < job.ai_shortlist_count:
            return Response(
                {
                    "error": (
                        f"Insufficient AI interview capacity: Provided windows offer {capacities['ai_capacity']} "
                        f"slots, but {job.ai_shortlist_count} are required for the AI shortlist."
                    ),
                    "ai_capacity": capacities['ai_capacity'],
                    "ai_shortlist_count": job.ai_shortlist_count
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if capacities['hr_capacity'] < job.final_shortlist_count:
            return Response(
                {
                    "error": (
                        f"Insufficient HR interview capacity: Provided windows offer {capacities['hr_capacity']} "
                        f"slots, but {job.final_shortlist_count} are required for the final shortlist."
                    ),
                    "hr_capacity": capacities['hr_capacity'],
                    "final_shortlist_count": job.final_shortlist_count
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Transition stage to collecting
        job.stage = 'collecting'
        job.published_at = timezone.now()
        job.save(update_fields=['stage', 'published_at'])

        # Ensure JobRound objects exist for rounds 1, 2, 3
        for r in (1, 2, 3):
            JobRound.objects.get_or_create(job=job, round=r)

        serializer = self.get_serializer(job)
        return Response({
            "message": "Job published successfully. Candidate application link is now live.",
            "job": serializer.data
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        user = request.user

        active_jobs = Job.objects.filter(hr=user, is_deleted=False).exclude(stage='completed').count()
        total_applications = Application.objects.filter(job__hr=user, job__is_deleted=False).count()
        cvs_needing_attention = Application.objects.filter(
            job__hr=user, job__is_deleted=False, processing_status='failed'
        ).count()
        upcoming_interviews = Interview.objects.filter(
            hr=user, status='scheduled', start_at__gte=timezone.now()
        ).count()

        jobs_queryset = self.get_queryset()
        serializer = self.get_serializer(jobs_queryset, many=True)

        return Response({
            "stats": {
                "active_jobs": active_jobs,
                "total_applications": total_applications,
                "cvs_needing_attention": cvs_needing_attention,
                "upcoming_interviews": upcoming_interviews,
            },
            "jobs": serializer.data
        }, status=status.HTTP_200_OK)
