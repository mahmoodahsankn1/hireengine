from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from accounts.models import User
from accounts.serializers import (
    RegisterSerializer,
    VerifyOtpSerializer,
    ResendOtpSerializer,
    CustomTokenObtainPairSerializer,
    UserSerializer,
)
from accounts.services import generate_and_send_otp, verify_otp, resend_otp

class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_scope = 'otp'

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Generate and dispatch OTP email
        generate_and_send_otp(user)

        return Response(
            {
                "message": "Registration successful. A 6-digit verification code has been sent to your email.",
                "email": user.email,
                "user_id": str(user.id),
            },
            status=status.HTTP_201_CREATED,
        )

class VerifyOtpView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = VerifyOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = verify_otp(
            email=serializer.validated_data['email'],
            code=serializer.validated_data['code']
        )

        refresh = RefreshToken.for_user(user)
        return Response({
            "message": "Email verified successfully.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "company_name": user.company_name,
                "timezone": user.tz,
            }
        }, status=status.HTTP_200_OK)

class ResendOtpView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = ResendOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resend_otp(serializer.validated_data['email'])

        return Response({
            "message": "A new verification code has been sent to your email."
        }, status=status.HTTP_200_OK)

class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = CustomTokenObtainPairSerializer

class ProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user
