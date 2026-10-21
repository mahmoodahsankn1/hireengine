from django.urls import path, include
from rest_framework.routers import DefaultRouter
from notifications.views import EmailLogViewSet

router = DefaultRouter()
router.register(r'emails', EmailLogViewSet, basename='email-log')

urlpatterns = [
    path('', include(router.urls)),
]
