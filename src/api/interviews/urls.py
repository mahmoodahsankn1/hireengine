from django.urls import path
from interviews.views import (
    AIInterviewInfoView,
    AIInterviewStartView,
    AIInterviewFinishView,
    HRInterviewDetailView,
    # Phase 6
    HRMeetingInfoView,
    HRMeetingJoinView,
    HRInterviewJoinView,
    HRInterviewFeedbackView,
)

urlpatterns = [
    # AI interview (Phase 5)
    path('ai/<str:token>/info/', AIInterviewInfoView.as_view(), name='ai-interview-info'),
    path('ai/<str:token>/start/', AIInterviewStartView.as_view(), name='ai-interview-start'),
    path('ai/<str:token>/finish/', AIInterviewFinishView.as_view(), name='ai-interview-finish'),

    # HR interview detail & HR-side actions (Phases 5 + 6)
    path('<uuid:pk>/', HRInterviewDetailView.as_view(), name='hr-interview-detail'),
    path('<uuid:pk>/join/', HRInterviewJoinView.as_view(), name='hr-interview-join'),
    path('<uuid:pk>/feedback/', HRInterviewFeedbackView.as_view(), name='hr-interview-feedback'),
]
