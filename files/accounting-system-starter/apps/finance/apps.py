"""Finance app configuration."""
from django.apps import AppConfig


class FinanceConfig(AppConfig):
    """Finance application for accounting core: CoA, journals, GL, audit log."""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.finance'
