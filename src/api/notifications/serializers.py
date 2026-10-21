from rest_framework import serializers
from notifications.models import EmailLog

class EmailLogSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source='job.title', read_only=True)
    candidate_name = serializers.CharField(source='application.full_name', read_only=True)

    class Meta:
        model = EmailLog
        fields = [
            'id',
            'recipient',
            'kind',
            'job',
            'job_title',
            'application',
            'candidate_name',
            'status',
            'attempts',
            'error',
            'created_at',
            'sent_at',
        ]
        read_only_fields = fields
