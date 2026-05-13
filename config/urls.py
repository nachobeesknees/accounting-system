from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path('', include('apps.core.urls', namespace='core')),
]
