"""
Core abstract models and base classes for all financial records.

Every financial model inherits created_at, updated_at, created_by, updated_by, and deleted_at.
"""

import uuid
from django.db import models
from django.contrib.auth.models import User


class BaseFinancialModel(models.Model):
    """
    Abstract base class for all financial records.

    Every financial record must have:
    - Audit fields: created_at, updated_at, created_by, updated_by
    - Soft delete: deleted_at (NULL = not deleted)
    """

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='%(class)s_created'
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='%(class)s_updated'
    )
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        abstract = True

    def soft_delete(self) -> None:
        """Mark this record as deleted without removing it from the database."""
        from django.utils import timezone
        self.deleted_at = timezone.now()
        self.save()

    def restore(self) -> None:
        """Restore a soft-deleted record."""
        self.deleted_at = None
        self.save()

    def is_deleted(self) -> bool:
        """Check if this record is soft-deleted."""
        return self.deleted_at is not None
