from django.http import JsonResponse
from django.db import connection
from apps.core.models import Entity
import json


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
