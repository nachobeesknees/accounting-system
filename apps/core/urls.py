from django.urls import path
from . import views

app_name = 'core'

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('login/', views.demo_login, name='demo_login'),
    path('logout/', views.logout_view, name='logout'),
    path('dashboard/', views.dashboard, name='dashboard_alt'),
    path('journal-entries/', views.journal_entries, name='journal_entries'),
    path('journal-entries/<str:entry_id>/', views.journal_entry_detail, name='journal_entry_detail'),
    path('chart-of-accounts/', views.chart_of_accounts, name='chart_of_accounts'),
    path('reports/', views.reports, name='reports'),
    path('entities/', views.entities, name='entities'),
    path('api/overview/', views.api_overview, name='api_overview'),
    path('api/health/', views.health_check, name='health_check'),
]
