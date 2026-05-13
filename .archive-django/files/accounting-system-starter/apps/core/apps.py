"""Core app configuration."""
from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Core application for entities and user management."""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'
