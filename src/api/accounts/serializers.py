from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth.password_validation import validate_password
from accounts.models import User

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])

    class Meta:
        model = User
        fields = [
            'id', 'email', 'password', 'full_name', 'company_name',
            'company_description', 'address', 'tz'
        ]
        extra_kwargs = {
            'company_description': {'required': False, 'allow_blank': True},
            'address': {'required': False, 'allow_blank': True},
            'tz': {'required': False},
        }

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email=normalized).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return normalized

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(
            email=validated_data['email'],
            full_name=validated_data['full_name'],
            company_name=validated_data['company_name'],
            company_description=validated_data.get('company_description', ''),
            address=validated_data.get('address', ''),
            tz=validated_data.get('tz', 'Asia/Kolkata'),
            is_email_verified=False
        )
        user.set_password(password)
        user.save()
        return user

class VerifyOtpSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    code = serializers.CharField(required=True, min_length=6, max_length=6)

    def validate_email(self, value):
        return value.strip().lower()

class ResendOtpSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return value.strip().lower()

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        
        if not self.user.is_email_verified:
            raise AuthenticationFailed(
                detail="Email is not verified. Please verify your email first.",
                code="email_not_verified"
            )

        data['user'] = {
            'id': str(self.user.id),
            'email': self.user.email,
            'full_name': self.user.full_name,
            'company_name': self.user.company_name,
            'timezone': self.user.tz,
        }
        return data

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'email', 'full_name', 'company_name',
            'company_description', 'address', 'tz',
            'is_email_verified', 'created_at'
        ]
        read_only_fields = ['id', 'email', 'is_email_verified', 'created_at']
