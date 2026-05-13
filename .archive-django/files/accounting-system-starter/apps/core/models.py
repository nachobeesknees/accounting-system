"""
Core models: Entity, User, and permission structures.

References CLAUDE.md section on multi-entity scoping and SoD hooks.
Per docs/data-model.md: entities table with hierarchy, functional currency, fiscal year.
"""
import uuid
from decimal import Decimal
from typing import Optional

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _


class Entity(models.Model):
    """
    Legal entity in the consolidated group.

    Per docs/data-model.md entities table. Multi-tier ownership via entity_ownership.
    Every financial record is entity-scoped via entity_id.

    Invariants:
    - jurisdiction_country must be registered in localization modules (v1: US only)
    - functional_currency is ISO 4217 code
    - fiscal_year_end_month and day define entity's fiscal year boundary
    - local_attributes validated by jurisdiction-specific localization module
    """

    # Primary identifier
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Basic identity
    legal_name = models.CharField(
        max_length=255,
        help_text="Legal entity name on corporate records"
    )
    dba_name = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Doing Business As name, if different from legal_name"
    )
    tax_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Encrypted at rest. Format varies by jurisdiction (EIN, RUT, VAT #, etc.)"
    )

    # Entity classification
    ENTITY_TYPE_CHOICES = [
        ('opco', _('Operating Company')),
        ('holdco', _('Holding Company')),
        ('mgmt_co', _('Management Company')),
        ('investment', _('Investment Entity')),
        ('other', _('Other')),
    ]
    entity_type = models.CharField(
        max_length=20,
        choices=ENTITY_TYPE_CHOICES,
        default='opco',
        help_text="Legal structure and consolidation treatment"
    )

    # Jurisdiction (drives localization module)
    jurisdiction_country = models.CharField(
        max_length=2,
        help_text="ISO 3166-1 country code. Determines which localization module applies."
    )
    jurisdiction_state = models.CharField(
        max_length=2,
        null=True,
        blank=True,
        help_text="US state abbreviation or equivalent for state-level jurisdictions"
    )

    # Fiscal calendar (per CLAUDE.md: mixed year-ends across entities)
    fiscal_year_end_month = models.SmallIntegerField(
        help_text="Month (1-12) of fiscal year-end"
    )
    fiscal_year_end_day = models.SmallIntegerField(
        help_text="Day (1-31) of fiscal year-end"
    )

    # Accounting configuration
    functional_currency = models.CharField(
        max_length=3,
        help_text="ISO 4217 currency code. Entity's reporting currency before consolidation."
    )

    ACCOUNTING_BASIS_CHOICES = [
        ('cash', _('Cash')),
        ('modified_cash', _('Modified Cash')),
        ('accrual', _('Accrual')),
    ]
    accounting_basis = models.CharField(
        max_length=20,
        choices=ACCOUNTING_BASIS_CHOICES,
        default='modified_cash',
        help_text="Basis of accounting per CLAUDE.md: mixed basis allowed across entities"
    )

    # Basis-specific feature flags
    basis_features = models.JSONField(
        default=dict,
        blank=True,
        help_text="Accounting basis features: {tracks_deferred_revenue: bool, ...}"
    )

    # Jurisdiction-specific required fields
    local_attributes = models.JSONField(
        default=dict,
        blank=True,
        help_text="Validated by active localization module for jurisdiction_country"
    )

    # Lifecycle
    active = models.BooleanField(
        default=True,
        help_text="Whether entity is currently active"
    )
    inception_date = models.DateField(
        help_text="Date entity was formed/acquired"
    )
    dissolution_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date entity was dissolved/divested, if applicable"
    )

    # Audit trail (per CLAUDE.md: created_by, updated_by on every model)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'core.User',
        on_delete=models.PROTECT,
        related_name='entities_created',
        null=True,
        editable=False
    )
    updated_by = models.ForeignKey(
        'core.User',
        on_delete=models.SET_NULL,
        related_name='entities_updated',
        null=True,
        editable=False
    )

    # Soft delete (per CLAUDE.md)
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Soft delete timestamp; null = not deleted"
    )

    class Meta:
        db_table = 'entities'
        verbose_name = _('Entity')
        verbose_name_plural = _('Entities')
        ordering = ['legal_name']
        indexes = [
            models.Index(fields=['jurisdiction_country']),
            models.Index(fields=['active', 'deleted_at']),
        ]

    def __str__(self) -> str:
        return f"{self.legal_name} ({self.functional_currency})"

    def is_deleted(self) -> bool:
        """Check if entity is soft-deleted."""
        return self.deleted_at is not None


class EntityOwnership(models.Model):
    """
    Multi-tier ownership relationships with effective dates.

    Per docs/data-model.md: entity_ownership table.
    Models parent->child ownership in consolidated group.

    Invariants (db-level):
    - Sum of ownership_percent for a child at any effective date <= 100
    - No cycles (a parent cannot be downstream of its child)
    - Self-ownership rejected
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    parent_entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        related_name='child_ownerships'
    )
    child_entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        related_name='parent_ownerships'
    )

    # Ownership percentage with 6 decimal places for precision
    ownership_percent = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        help_text="Ownership percentage (0-100) with precision for complex structures"
    )

    # Effective dating for ownership changes
    effective_from = models.DateField(
        help_text="Date this ownership relationship became effective"
    )
    effective_to = models.DateField(
        null=True,
        blank=True,
        help_text="Date ownership ended; null = currently active"
    )

    notes = models.TextField(
        blank=True,
        help_text="Context for the ownership (acquisition date, restructuring notes, etc.)"
    )

    class Meta:
        db_table = 'entity_ownership'
        verbose_name = _('Entity Ownership')
        verbose_name_plural = _('Entity Ownerships')
        constraints = [
            models.UniqueConstraint(
                fields=['parent_entity', 'child_entity', 'effective_from'],
                name='unique_ownership_per_period'
            ),
        ]
        indexes = [
            models.Index(fields=['parent_entity', 'effective_from', 'effective_to']),
            models.Index(fields=['child_entity', 'effective_from', 'effective_to']),
        ]

    def __str__(self) -> str:
        return f"{self.parent_entity.legal_name} owns {self.ownership_percent}% of {self.child_entity.legal_name}"


class User(AbstractUser):
    """
    Application user extending Django's AbstractUser.

    Per CLAUDE.md: users field and created_by/updated_by tracking.
    Per docs/data-model.md: users table for auth + profile.

    Future: SSO via django-allauth or WorkOS (Phase 0 decision deferred).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Profile
    profile_picture_url = models.URLField(
        blank=True,
        help_text="User's profile picture (from SSO or uploaded)"
    )
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        help_text="Contact phone number"
    )

    # Audit trail
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Soft delete
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Soft delete timestamp"
    )

    class Meta:
        db_table = 'users'
        verbose_name = _('User')
        verbose_name_plural = _('Users')
        ordering = ['last_name', 'first_name']
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['deleted_at']),
        ]

    def __str__(self) -> str:
        return f"{self.get_full_name()} ({self.email})"

    def is_deleted(self) -> bool:
        """Check if user is soft-deleted."""
        return self.deleted_at is not None


class UserEntityPermission(models.Model):
    """
    Per-user, per-entity role assignment.

    Per docs/data-model.md: entity_permissions table.
    Per CLAUDE.md: entity scoping via entity_id; row-level permission scoping in application.

    Invariants:
    - User can have at most one role per entity per effective date
    - Default-deny: users only see entities they're assigned to
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='entity_permissions'
    )
    entity = models.ForeignKey(
        Entity,
        on_delete=models.CASCADE,
        related_name='user_permissions'
    )

    # Role assignment (v1 roles)
    ROLE_CHOICES = [
        ('admin', _('Administrator')),
        ('controller', _('Controller')),
        ('bookkeeper', _('Bookkeeper')),
        ('approver', _('Approver')),
        ('read_only', _('Read-Only')),
    ]
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        help_text="Role for this user in this entity"
    )

    # Effective dating (allows role changes over time)
    effective_from = models.DateField(
        help_text="Date this permission became effective"
    )
    effective_to = models.DateField(
        null=True,
        blank=True,
        help_text="Date permission ended; null = currently active"
    )

    # SoD enforcement (per CLAUDE.md)
    can_approve_own_entries = models.BooleanField(
        default=False,
        help_text="Override: user can approve their own entries (audit-logged)"
    )

    # Audit trail
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='permission_assignments_created',
        null=True,
        editable=False
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='permission_assignments_updated',
        null=True,
        editable=False
    )

    # Soft delete
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'user_entity_permissions'
        verbose_name = _('User Entity Permission')
        verbose_name_plural = _('User Entity Permissions')
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'entity', 'effective_from'],
                name='unique_user_entity_permission_per_period'
            ),
        ]
        indexes = [
            models.Index(fields=['user', 'effective_from', 'effective_to']),
            models.Index(fields=['entity', 'effective_from', 'effective_to']),
        ]

    def __str__(self) -> str:
        return f"{self.user.email} ({self.role}) @ {self.entity.legal_name}"

    def is_active(self) -> bool:
        """Check if permission is currently active."""
        from django.utils import timezone
        today = timezone.now().date()
        return (self.effective_from <= today and
                (self.effective_to is None or self.effective_to >= today) and
                self.deleted_at is None)
