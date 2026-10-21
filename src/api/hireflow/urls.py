from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from applications.views import PublicJobFormView, PublicApplyView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/forms/<slug:slug>/', PublicJobFormView.as_view(), name='public-job-form'),
    path('api/apply/<slug:slug>/', PublicApplyView.as_view(), name='public-apply'),
    path('api/accounts/', include('accounts.urls')),
    path('api/jobs/', include('jobs.urls')),
    path('api/applications/', include('applications.urls')),
    path('api/interviews/', include('interviews.urls')),
    path('api/notifications/', include('notifications.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
