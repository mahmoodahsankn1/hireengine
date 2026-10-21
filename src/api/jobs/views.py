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

    @action(detail=True, methods=['get', 'post'], url_path='send')
    def send(self, request, pk=None):
        """
        GET /api/jobs/<id>/send/
          Returns the preview of advancing candidates, scheduled slots (formatted with HR timezone),
          rejected candidates, slot capacity, and shortfall.

        POST /api/jobs/<id>/send/
          Atomically locks the job_rounds row for the current round.
          Refuses second press with 409 Conflict if emails_sent_at is already set.
          Allocates clash-free interview slots (Round 1: AI, Round 2: HR).
          Updates application pipeline statuses.
          Transitions job stage (cv_review -> ai_interview, ai_review -> hr_interview, hr_review -> completed).
          Queues interview invitations (and optional regrets via body: {"send_regret": true}).
        """
        from django.db import transaction
        from interviews.services import preview_allocation, allocate, NotEnoughSlots, format_interview_datetime
        from notifications.tasks import queue_application_email

        job = self.get_object()

        # Map current stage to round number and kind
        stage_round_map = {
            'cv_review': (1, 'ai'),
            'ai_review': (2, 'hr'),
            'hr_review': (3, 'final'),
        }

        if job.stage not in stage_round_map:
            # Check if this is a repeat press after a round was already sent
            if job.stage == 'ai_interview':
                r1 = JobRound.objects.filter(job=job, round=1).first()
                if r1 and r1.emails_sent_at is not None:
                    return Response(
                        {"error": "Invitations for Round 1 have already been sent."},
                        status=status.HTTP_409_CONFLICT
                    )
            elif job.stage == 'hr_interview':
                r2 = JobRound.objects.filter(job=job, round=2).first()
                if r2 and r2.emails_sent_at is not None:
                    return Response(
                        {"error": "Invitations for Round 2 have already been sent."},
                        status=status.HTTP_409_CONFLICT
                    )
            elif job.stage == 'completed':
                r3 = JobRound.objects.filter(job=job, round=3).first()
                if r3 and r3.emails_sent_at is not None:
                    return Response(
                        {"error": "Final results for Round 3 have already been sent."},
                        status=status.HTTP_409_CONFLICT
                    )

            return Response(
                {"error": f"Send is only available during review stages (cv_review, ai_review, hr_review). Current stage: '{job.stage}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        round_num, kind = stage_round_map[job.stage]

        if request.method == 'GET':
            round_obj, _ = JobRound.objects.get_or_create(job=job, round=round_num)
            already_sent = round_obj.emails_sent_at is not None

            if round_num in (1, 2):
                if round_num == 1:
                    advancing_apps = list(Application.objects.filter(job=job, advance_next=True).order_by('cv_rank', '-cv_score', 'applied_at'))
                    rejected_apps = list(Application.objects.filter(job=job, advance_next=False).exclude(pipeline_status='rejected'))
                else:
                    # Round 2: filter advancing from Round 1
                    advancing_apps = list(Application.objects.filter(job=job, advance_next=True))
                    rejected_apps = list(Application.objects.filter(job=job, advance_next=False, pipeline_status='ai_invited'))

                preview_data = preview_allocation(job, kind, advancing_apps)

                # Format timestamps with HR's timezone
                tz_name = job.hr.timezone or 'Asia/Kolkata'
                for item in preview_data['assignments']:
                    if item.get('start_at'):
                        item['start_at_formatted'] = format_interview_datetime(item['start_at'], tz_name)

                return Response({
                    "round_number": round_num,
                    "stage": job.stage,
                    "kind": kind,
                    "already_sent": already_sent,
                    "can_send": (not already_sent) and (len(advancing_apps) > 0) and (preview_data['can_allocate']),
                    "advancing_count": len(advancing_apps),
                    "advancing": preview_data['assignments'],
                    "rejected_count": len(rejected_apps),
                    "rejected": [
                        {
                            "id": str(a.id),
                            "candidate_label": getattr(a, 'candidate_label', f"Candidate #{a.cv_rank or str(a.id)[:6].upper()}"),
                            "name": a.full_name if job.stage != 'cv_review' else None,
                        }
                        for a in rejected_apps
                    ],
                    "total_available_slots": preview_data['total_available_slots'],
                    "shortfall": preview_data['shortfall'],
                }, status=status.HTTP_200_OK)

            else:
                # Round 3 (HR Review -> Final Selection)
                attended_interviews = Interview.objects.filter(job=job, kind='hr').exclude(status__in=['cancelled', 'no_show'])
                unrated_count = attended_interviews.filter(feedback__isnull=True).count()

                selected_apps = list(Application.objects.filter(job=job, interviews__kind='hr', interviews__feedback__decision='selected'))
                rejected_apps = list(Application.objects.filter(job=job, pipeline_status='hr_invited').exclude(id__in=[a.id for a in selected_apps]))

                can_send = (not already_sent) and (unrated_count == 0) and (len(selected_apps) > 0 or len(rejected_apps) > 0)

                return Response({
                    "round_number": 3,
                    "stage": job.stage,
                    "already_sent": already_sent,
                    "can_send": can_send,
                    "unrated_count": unrated_count,
                    "selected_count": len(selected_apps),
                    "selected": [
                        {"id": str(a.id), "full_name": a.full_name, "email": a.email}
                        for a in selected_apps
                    ],
                    "rejected_count": len(rejected_apps),
                    "rejected": [
                        {"id": str(a.id), "full_name": a.full_name, "email": a.email}
                        for a in rejected_apps
                    ],
                }, status=status.HTTP_200_OK)

        # POST logic: Execute Send Action
        send_regret = bool(request.data.get('send_regret', False))

        with transaction.atomic():
            # Lock the JobRound row
            round_obj, created = JobRound.objects.select_for_update().get_or_create(job=job, round=round_num)

            if round_obj.emails_sent_at is not None:
                return Response(
                    {"error": f"Invitations for Round {round_num} have already been sent."},
                    status=status.HTTP_409_CONFLICT
                )

            # Re-check stage inside lock
            job.refresh_from_db()
            if job.stage != list(stage_round_map.keys())[round_num - 1]:
                return Response(
                    {"error": f"Stage mismatch. Current stage: '{job.stage}'."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if round_num == 1:
                advancing_apps = list(
                    Application.objects.filter(job=job, advance_next=True).order_by('cv_rank', '-cv_score', 'applied_at')
                )
                if not advancing_apps:
                    return Response(
                        {"error": "No candidates are marked to advance to Round 2."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                rejected_apps = list(
                    Application.objects.filter(job=job, advance_next=False).exclude(pipeline_status='rejected')
                )

                try:
                    interviews = allocate(job, 'ai', advancing_apps)
                except NotEnoughSlots as exc:
                    return Response(
                        {"error": f"Cannot send invitations: insufficient AI interview slots. Shortfall: {exc.shortfall}."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Update statuses
                Application.objects.filter(id__in=[a.id for a in advancing_apps]).update(pipeline_status='ai_invited')
                Application.objects.filter(id__in=[a.id for a in rejected_apps]).update(pipeline_status='rejected', rejected_round=1)

                job.stage = 'ai_interview'
                job.save(update_fields=['stage', 'updated_at'])

                round_obj.emails_sent_at = timezone.now()
                round_obj.save(update_fields=['emails_sent_at'])

                # Queue emails on commit
                for app in advancing_apps:
                    transaction.on_commit(lambda a=app: queue_application_email(a, 'ai_invite', job=job))

                if send_regret:
                    for app in rejected_apps:
                        transaction.on_commit(lambda a=app: queue_application_email(a, 'ai_regret', job=job))

                return Response({
                    "message": f"Successfully scheduled {len(interviews)} AI interviews and queued invitations.",
                    "advancing_count": len(advancing_apps),
                    "rejected_count": len(rejected_apps) if send_regret else 0,
                    "stage": job.stage,
                }, status=status.HTTP_200_OK)

            elif round_num == 2:
                advancing_apps = list(Application.objects.filter(job=job, advance_next=True))
                if not advancing_apps:
                    return Response(
                        {"error": "No candidates are marked to advance to Round 3."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                rejected_apps = list(
                    Application.objects.filter(job=job, advance_next=False, pipeline_status='ai_invited')
                )

                try:
                    interviews = allocate(job, 'hr', advancing_apps)
                except NotEnoughSlots as exc:
                    return Response(
                        {"error": f"Cannot send invitations: insufficient HR interview slots. Shortfall: {exc.shortfall}."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Update statuses
                Application.objects.filter(id__in=[a.id for a in advancing_apps]).update(pipeline_status='hr_invited')
                Application.objects.filter(id__in=[a.id for a in rejected_apps]).update(pipeline_status='rejected', rejected_round=2)

                job.stage = 'hr_interview'
                job.save(update_fields=['stage', 'updated_at'])

                round_obj.emails_sent_at = timezone.now()
                round_obj.save(update_fields=['emails_sent_at'])

                for app in advancing_apps:
                    transaction.on_commit(lambda a=app: queue_application_email(a, 'hr_invite', job=job))

                if send_regret:
                    for app in rejected_apps:
                        transaction.on_commit(lambda a=app: queue_application_email(a, 'hr_regret', job=job))

                return Response({
                    "message": f"Successfully scheduled {len(interviews)} HR interviews and queued invitations.",
                    "advancing_count": len(advancing_apps),
                    "rejected_count": len(rejected_apps) if send_regret else 0,
                    "stage": job.stage,
                }, status=status.HTTP_200_OK)

            else:
                # Round 3
                attended = Interview.objects.filter(job=job, kind='hr').exclude(status__in=['cancelled', 'no_show'])
                if attended.filter(feedback__isnull=True).exists():
                    return Response(
                        {"error": "Cannot send final results: Every attended interview must have feedback and a decision submitted."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                selected_apps = list(Application.objects.filter(job=job, interviews__kind='hr', interviews__feedback__decision='selected'))
                rejected_apps = list(Application.objects.filter(job=job, pipeline_status='hr_invited').exclude(id__in=[a.id for a in selected_apps]))

                Application.objects.filter(id__in=[a.id for a in selected_apps]).update(pipeline_status='selected')
                Application.objects.filter(id__in=[a.id for a in rejected_apps]).update(pipeline_status='rejected', rejected_round=3)

                job.stage = 'completed'
                job.save(update_fields=['stage', 'updated_at'])

                round_obj.emails_sent_at = timezone.now()
                round_obj.save(update_fields=['emails_sent_at'])

                for app in selected_apps:
                    transaction.on_commit(lambda a=app: queue_application_email(a, 'final_selected', job=job))

                if send_regret:
                    for app in rejected_apps:
                        transaction.on_commit(lambda a=app: queue_application_email(a, 'final_rejected', job=job))

                return Response({
                    "message": f"Final results processed. Selected: {len(selected_apps)}, Rejected: {len(rejected_apps)}.",
                    "selected_count": len(selected_apps),
                    "rejected_count": len(rejected_apps) if send_regret else 0,
                    "stage": job.stage,
                }, status=status.HTTP_200_OK)

