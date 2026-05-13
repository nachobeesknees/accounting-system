from django.urls import path
from . import views

app_name = 'core'

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('login/', views.demo_login, name='demo_login'),
    path('logout/', views.logout_view, name='logout'),

    path('dashboard/', views.dashboard, name='dashboard_alt'),
    path('accounts/', views.chart_of_accounts, name='chart_of_accounts'),
    path('journal/', views.journal_entries, name='journal_entries'),
    path('journal/<str:entry_id>/', views.journal_entry_detail, name='journal_entry_detail'),
    path('ledger/', views.general_ledger, name='general_ledger'),

    path('invoices/', views.invoices, name='invoices'),
    path('customers/', views.customers, name='customers'),
    path('bills/', views.bills, name='bills'),
    path('vendors/', views.vendors, name='vendors'),

    path('reports/', views.reports, name='reports'),
    path('reconciliation/', views.reconciliation, name='reconciliation'),

    path('periods/', views.periods, name='periods'),
    path('entities/', views.entities, name='entities'),
    path('settings/', views.settings_view, name='settings'),

    path('api/health/', views.health_check, name='health_check'),
    path('api/overview/', views.api_overview, name='api_overview'),
]
