from django.urls import path
from interviews.views import (
    AIInterviewInfoView,
    AIInterviewStartView,
    AIInterviewFinishView,
    HRInterviewDetailView,
)

urlpatterns = [
    path('ai/<str:token>/info/', AIInterviewInfoView.as_view(), name='ai-interview-info'),
    path('ai/<str:token>/start/', AIInterviewStartView.as_view(), name='ai-interview-start'),
    path('ai/<str:token>/finish/', AIInterviewFinishView.as_view(), name='ai-interview-finish'),
    path('<uuid:pk>/', HRInterviewDetailView.as_view(), name='hr-interview-detail'),
]
