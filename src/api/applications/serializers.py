import os
from rest_framework import serializers
from django.utils import timezone
from applications.models import Application
from jobs.models import Job
from applications.extractors import extract_resume_text, ResumeExtractionError, ScannedResumeError

POLICY_VERSION = "v1.0"
MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

class PublicJobDetailSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='hr.company_name', read_only=True)
    company_description = serializers.CharField(source='hr.company_description', read_only=True)
    closed = serializers.SerializerMethodField()
    closed_reason = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            'id',
            'title',
            'company_name',
            'company_description',
            'location',
            'work_mode',
            'employment_type',
            'description',
            'required_skills',
            'application_deadline',
            'closed',
            'closed_reason',
        ]

    def get_closed(self, obj) -> bool:
        return obj.stage != 'collecting' or obj.application_deadline <= timezone.now()

    def get_closed_reason(self, obj) -> str:
        if obj.application_deadline <= timezone.now():
            return "Application deadline has passed."
        if obj.stage != 'collecting':
            return "This position is no longer accepting applications."
        return ""

class ApplicationPublicCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255, trim_whitespace=True)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=30, trim_whitespace=True)
    resume_file = serializers.FileField()
    consent_given = serializers.BooleanField()

    def validate_consent_given(self, value):
        if not value:
            raise serializers.ValidationError("You must consent to data processing and privacy terms to apply.")
        return value

    def validate_resume_file(self, file_obj):
        name = file_obj.name.lower()
        if not (name.endswith('.pdf') or name.endswith('.docx')):
            raise serializers.ValidationError("Unsupported file format. Please upload a PDF or DOCX document.")

        if file_obj.size > MAX_RESUME_SIZE_BYTES:
            raise serializers.ValidationError("Resume file size exceeds the 5MB limit.")

        # Test extraction & scanned document check
        try:
            # Seek to start in case it's in memory or temporary file
            file_obj.seek(0)
            text = extract_resume_text(file_obj, file_obj.name)
            file_obj.seek(0)
        except ScannedResumeError as sre:
            raise serializers.ValidationError(str(sre))
        except ResumeExtractionError as ree:
            raise serializers.ValidationError(f"Unable to read file: {str(ree)}")
        except Exception as exc:
            raise serializers.ValidationError(f"Invalid or corrupted file: {str(exc)}")

        return file_obj

class ApplicationBlindSerializer(serializers.ModelSerializer):
    candidate_label = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            'id',
            'candidate_label',
            'cv_score',
            'score_breakdown',
            'processing_status',
            'processing_attempts',
            'cv_rank',
            'pipeline_status',
            'advance_next',
            'applied_at',
            'anonymized_text',
        ]

    def get_candidate_label(self, obj) -> str:
        if obj.cv_rank:
            return f"Candidate #{obj.cv_rank}"
        return f"Candidate #{str(obj.id)[:6].upper()}"

class ApplicationRevealedSerializer(serializers.ModelSerializer):
    candidate_label = serializers.SerializerMethodField()
    resume_file_url = serializers.SerializerMethodField()
    ai_interview = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            'id',
            'candidate_label',
            'full_name',
            'email',
            'phone',
            'resume_file',
            'resume_file_url',
            'cv_score',
            'score_breakdown',
            'processing_status',
            'processing_attempts',
            'cv_rank',
            'pipeline_status',
            'advance_next',
            'applied_at',
            'anonymized_text',
            'ai_interview',
        ]

    def get_candidate_label(self, obj) -> str:
        if obj.cv_rank:
            return f"Candidate #{obj.cv_rank}"
        return f"Candidate #{str(obj.id)[:6].upper()}"

    def get_resume_file_url(self, obj) -> str:
        if obj.resume_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.resume_file.url)
            return obj.resume_file.url
        return None

    def get_ai_interview(self, obj):
        intv = obj.interviews.filter(kind='ai').first()
        if not intv:
            return None

        ai_res_data = None
        if hasattr(intv, 'ai_result'):
            res = intv.ai_result
            ai_res_data = {
                "score": res.score,
                "score_breakdown": res.score_breakdown,
                "scoring_status": res.scoring_status,
                "transcript": res.transcript,
                "model_name": res.model_name,
                "prompt_version": res.prompt_version,
                "scored_at": res.scored_at,
            }

        return {
            "id": str(intv.id),
            "status": intv.status,
            "start_at": intv.start_at,
            "duration_minutes": intv.duration_minutes,
            "started_at": intv.started_at,
            "ended_at": intv.ended_at,
            "ai_result": ai_res_data,
        }


