from django.http import JsonResponse
from django.db import connection
from django.shortcuts import render
from django.contrib.auth import authenticate, login
from django.views.decorators.http import require_http_methods
from apps.core.models import Entity
import json


DEMO_ACCOUNTS = [
    {
        'username': 'demo_admin',
        'password': 'demo123',
        'role': 'Admin',
        'description': 'Full access to all entities and operations',
        'icon': '👨‍💼'
    },
    {
        'username': 'demo_accountant',
        'password': 'demo123',
        'role': 'Accountant',
        'description': 'Create and post journal entries, view GL',
        'icon': '📊'
    },
    {
        'username': 'demo_cfo',
        'password': 'demo123',
        'role': 'CFO',
        'description': 'Reports, consolidation, approval authority',
        'icon': '💼'
    },
    {
        'username': 'demo_controller',
        'password': 'demo123',
        'role': 'Controller',
        'description': 'Setup, approval, period locks',
        'icon': '🔐'
    },
]


@require_http_methods(["GET", "POST"])
def demo_login(request):
    """Demo login page with quick-login buttons for all demo accounts."""
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            return render(request, 'demo_login_success.html', {
                'user': user,
                'admin_url': '/admin/',
                'api_docs_url': '/api/docs/',
            })
        return render(request, 'demo_login.html', {
            'demo_accounts': DEMO_ACCOUNTS,
            'error': 'Login failed',
        })

    return render(request, 'demo_login.html', {
        'demo_accounts': DEMO_ACCOUNTS,
    })


def health_check(request):
    """Health check endpoint - verifies database and core systems are operational."""
    try:
        # Test database connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")

        # Test ORM query
        entity_count = Entity.objects.count()

        # Trigger check - verify invariant triggers exist
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*) FROM information_schema.triggers
                WHERE trigger_schema = 'public' AND trigger_name LIKE 'trg_%'
                """
            )
            trigger_count = cursor.fetchone()[0]

        return JsonResponse({
            'status': 'healthy',
            'database': 'connected',
            'entities': entity_count,
            'triggers': trigger_count,
            'invariants': 'enforced' if trigger_count >= 7 else 'pending',
        })
    except Exception as e:
        return JsonResponse({
            'status': 'unhealthy',
            'error': str(e),
        }, status=503)
