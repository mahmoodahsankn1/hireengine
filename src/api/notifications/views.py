import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from notifications.models import EmailLog
from notifications.serializers import EmailLogSerializer
from notifications.tasks import send_email_task

logger = logging.getLogger(__name__)

class EmailLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for HR to view and retry queued/failed email logs for their jobs.
    """
    serializer_class = EmailLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = EmailLog.objects.filter(job__hr=user).select_related('job', 'application').order_by('-created_at')

        job_id = self.request.query_params.get('job')
        if job_id:
            queryset = queryset.filter(job_id=job_id)

        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        return queryset

    @action(detail=True, methods=['post'], url_path='retry')
    def retry(self, request, pk=None):
        """
        Endpoint to retry delivery of a failed email.
        """
        email_log = self.get_object()

        if email_log.status != 'failed':
            return Response(
                {"error": f"Cannot retry email with status '{email_log.status}'. Only failed emails can be retried."},
                status=status.HTTP_400_BAD_REQUEST
            )

        email_log.status = 'queued'
        email_log.save(update_fields=['status'])

        send_email_task.delay(str(email_log.id))
        logger.info(f"Retrying email {email_log.id} ({email_log.kind}) to {email_log.recipient}")

        return Response(
            {
                "message": "Email has been queued for re-delivery.",
                "id": str(email_log.id),
                "status": "queued",
            },
            status=status.HTTP_200_OK
        )
