from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.views import (
    RegisterView,
    VerifyOtpView,
    ResendOtpView,
    LoginView,
    ProfileView,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='account-register'),
    path('verify-otp/', VerifyOtpView.as_view(), name='account-verify-otp'),
    path('resend-otp/', ResendOtpView.as_view(), name='account-resend-otp'),
    path('login/', LoginView.as_view(), name='account-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('profile/', ProfileView.as_view(), name='account-profile'),
]
