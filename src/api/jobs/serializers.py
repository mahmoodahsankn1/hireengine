import secrets
from rest_framework import serializers
from django.utils import timezone
from jobs.models import Job, AvailabilityWindow, JobRound
from interviews.services import calculate_capacity

class AvailabilityWindowSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvailabilityWindow
        fields = ['id', 'round', 'start_at', 'end_at']

    def validate(self, attrs):
        start_at = attrs.get('start_at')
        end_at = attrs.get('end_at')
        if start_at and end_at and end_at <= start_at:
            raise serializers.ValidationError({"end_at": "Window end time must be after start time."})
        return attrs

class JobSerializer(serializers.ModelSerializer):
    availability_windows = AvailabilityWindowSerializer(many=True, required=False)
    ai_capacity = serializers.SerializerMethodField()
    hr_capacity = serializers.SerializerMethodField()
    applications_count = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            'id', 'title', 'description', 'required_skills', 'min_experience_years',
            'employment_type', 'location', 'work_mode', 'salary_range', 'form_slug',
            'application_deadline', 'ai_shortlist_count', 'final_shortlist_count',
            'min_cv_score', 'ai_interview_prompt',
            'ai_duration_minutes', 'ai_buffer_minutes', 'ai_join_early_minutes', 'ai_late_grace_minutes',
            'hr_duration_minutes', 'hr_buffer_minutes', 'hr_join_early_minutes',
            'stage', 'is_deleted', 'published_at', 'created_at', 'updated_at',
            'availability_windows', 'ai_capacity', 'hr_capacity', 'applications_count'
        ]
        read_only_fields = [
            'id', 'form_slug', 'stage', 'is_deleted', 'published_at',
            'created_at', 'updated_at', 'ai_capacity', 'hr_capacity', 'applications_count'
        ]

    def get_ai_capacity(self, obj):
        try:
            return calculate_capacity(obj, kind='ai')
        except Exception:
            return 0

    def get_hr_capacity(self, obj):
        try:
            return calculate_capacity(obj, kind='hr')
        except Exception:
            return 0

    def get_applications_count(self, obj):
        return obj.applications.count()

    def validate(self, attrs):
        instance = getattr(self, 'instance', None)

        ai_count = attrs.get('ai_shortlist_count', instance.ai_shortlist_count if instance else None)
        final_count = attrs.get('final_shortlist_count', instance.final_shortlist_count if instance else None)
        if ai_count is not None and final_count is not None:
            if final_count > ai_count:
                raise serializers.ValidationError({
                    "final_shortlist_count": "Final shortlist count must be less than or equal to AI shortlist count."
                })

        late_grace = attrs.get('ai_late_grace_minutes', instance.ai_late_grace_minutes if instance else 2)
        buffer_min = attrs.get('ai_buffer_minutes', instance.ai_buffer_minutes if instance else 3)
        if late_grace > buffer_min:
            raise serializers.ValidationError({
                "ai_late_grace_minutes": "AI late grace minutes must be less than or equal to AI buffer minutes."
            })

        ai_dur = attrs.get('ai_duration_minutes', instance.ai_duration_minutes if instance else 5)
        if ai_dur < 1 or ai_dur > 5:
            raise serializers.ValidationError({
                "ai_duration_minutes": "AI duration minutes must be between 1 and 5 minutes."
            })

        # Application deadline checks
        deadline = attrs.get('application_deadline', instance.application_deadline if instance else None)
        if not instance and deadline and deadline <= timezone.now():
            raise serializers.ValidationError({
                "application_deadline": "Application deadline must be in the future."
            })

        # Update checks
        if instance:
            if instance.applications.exists():
                if 'description' in attrs and attrs['description'] != instance.description:
                    raise serializers.ValidationError({
                        "description": "Job description cannot be edited once applications exist."
                    })
                if 'required_skills' in attrs and attrs['required_skills'] != instance.required_skills:
                    raise serializers.ValidationError({
                        "required_skills": "Required skills cannot be edited once applications exist."
                    })

            if 'application_deadline' in attrs and attrs['application_deadline'] < instance.application_deadline:
                raise serializers.ValidationError({
                    "application_deadline": "Application deadline cannot be shortened once set. You may only extend it."
                })

        # Windows validation
        windows_data = attrs.get('availability_windows', None)
        if windows_data is not None and deadline:
            ai_windows = []
            hr_windows = []

            for idx, w in enumerate(windows_data):
                start = w.get('start_at')
                end = w.get('end_at')
                r = w.get('round')

                if start and end and end <= start:
                    raise serializers.ValidationError({
                        "availability_windows": f"Window #{idx + 1}: End time must be after start time."
                    })

                if start and start < deadline:
                    raise serializers.ValidationError({
                        "availability_windows": f"Window #{idx + 1}: Availability windows must start after the application deadline."
                    })

                if r == 2:
                    ai_windows.append(w)
                elif r == 3:
                    hr_windows.append(w)

            # HR windows must be after AI windows
            if ai_windows and hr_windows:
                max_ai_end = max(w['end_at'] for w in ai_windows)
                min_hr_start = min(w['start_at'] for w in hr_windows)
                if min_hr_start < max_ai_end:
                    raise serializers.ValidationError({
                        "availability_windows": "Round 3 (HR) interview windows must be scheduled after Round 2 (AI) interview windows."
                    })

        return attrs

    def create(self, validated_data):
        windows_data = validated_data.pop('availability_windows', [])
        validated_data['form_slug'] = secrets.token_urlsafe(8)
        validated_data['hr'] = self.context['request'].user
        validated_data['stage'] = 'draft'

        job = Job.objects.create(**validated_data)

        # Create windows
        for w in windows_data:
            AvailabilityWindow.objects.create(job=job, **w)

        return job

    def update(self, instance, validated_data):
        windows_data = validated_data.pop('availability_windows', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Replace-all on windows save
        if windows_data is not None:
            instance.availability_windows.all().delete()
            for w in windows_data:
                AvailabilityWindow.objects.create(job=instance, **w)

        return instance
