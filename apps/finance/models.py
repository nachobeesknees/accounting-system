"""
Financial models for multi-currency, multi-entity accounting system.

Core entities:
- Entity: legal entities (opcos, holdcos, mgmt cos)
- Account: chart of accounts (per-entity)
- JournalEntry & JournalLine: double-entry bookkeeping
- FXRate: currency exchange rates (date-effective)
- TransactionFX: FX metadata on transactions
- PeriodEndRevaluation: period-end FX remeasurement batches
- Period: accounting period calendar
- AuditLog: append-only transaction log

All money is Decimal with explicit currency codes.
FX rates are numeric(18,8) for precision.
Posted entries are immutable (via triggers).
Every mutation is audit-logged.
"""

from decimal import Decimal
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
import uuid

# ============================================================================
# Core Entity Models
# ============================================================================

class Entity(models.Model):
    """
    A legal entity that books transactions.

    Each entity has:
    - its own chart of accounts
    - its own period calendar
    - a functional currency for reporting
    - an accounting basis (cash, modified_cash, accrual)
    """

    ENTITY_TYPES = [
        ('opco', 'Operating Company'),
        ('holdco', 'Holding Company'),
        ('mgmt_co', 'Management Company'),
        ('investment', 'Investment Entity'),
        ('other', 'Other'),
    ]

    ACCOUNTING_BASIS = [
        ('cash', 'Cash'),
        ('modified_cash', 'Modified Cash'),
        ('accrual', 'Accrual'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    legal_name = models.CharField(max_length=255)
    dba_name = models.CharField(max_length=255, blank=True, null=True)
    tax_id = models.CharField(max_length=50, blank=True, null=True, help_text="EIN, RUT, VAT, etc.")

    entity_type = models.CharField(max_length=20, choices=ENTITY_TYPES)
    jurisdiction_country = models.CharField(max_length=2, help_text="ISO 3166-1 alpha-2")
    jurisdiction_state = models.CharField(max_length=50, blank=True, null=True)

    fiscal_year_end_month = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    fiscal_year_end_day = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(31)])

    functional_currency = models.CharField(max_length=3, help_text="ISO 4217 currency code (e.g., USD, EUR)")
    accounting_basis = models.CharField(max_length=20, choices=ACCOUNTING_BASIS)

    basis_features = models.JSONField(default=dict, blank=True, help_text="e.g., {tracks_deferred_revenue: true}")
    local_attributes = models.JSONField(default=dict, blank=True, help_text="Jurisdiction-specific fields")

    active = models.BooleanField(default=True)
    inception_date = models.DateField()
    dissolution_date = models.DateField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'entities'
        indexes = [
            models.Index(fields=['jurisdiction_country']),
            models.Index(fields=['active', 'deleted_at']),
        ]

    def __str__(self):
        return f"{self.legal_name} ({self.functional_currency})"


class Period(models.Model):
    """
    Accounting period calendar (per entity).

    Statuses: open, closed, locked
    - open: can post entries
    - closed: no posting, but can reopen
    - locked: permanent, cannot reopen
    """

    PERIOD_TYPES = [
        ('month', 'Month'),
        ('quarter', 'Quarter'),
        ('year', 'Year'),
        ('stub', 'Stub Period'),
    ]

    STATUS_CHOICES = [
        ('open', 'Open'),
        ('closed', 'Closed'),
        ('locked', 'Locked'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.PROTECT, related_name='periods')

    period_type = models.CharField(max_length=20, choices=PERIOD_TYPES)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')

    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='+')

    class Meta:
        db_table = 'periods'
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'start_date', 'end_date'],
                name='unique_period_per_entity_date_range'
            ),
        ]
        indexes = [
            models.Index(fields=['entity', 'start_date']),
            models.Index(fields=['entity', 'status']),
        ]

    def __str__(self):
        return f"{self.entity.legal_name} {self.period_type} {self.start_date}"


class Account(models.Model):
    """
    Chart of accounts (per entity).

    Each entity has its own CoA with hierarchical structure.
    Only leaf (postable) accounts can have journal lines.
    Non-postable accounts are rollups.
    """

    ACCOUNT_TYPES = [
        ('asset', 'Asset'),
        ('liability', 'Liability'),
        ('equity', 'Equity'),
        ('revenue', 'Revenue'),
        ('expense', 'Expense'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.PROTECT, related_name='accounts')
    code = models.CharField(max_length=20, help_text="e.g., 1010")
    name = models.CharField(max_length=255)

    parent = models.ForeignKey('self', on_delete=models.PROTECT, null=True, blank=True, related_name='children')

    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPES)
    account_subtype = models.CharField(max_length=50, blank=True, null=True, help_text="e.g., current_asset")
    normal_balance = models.CharField(max_length=10, choices=[('debit', 'Debit'), ('credit', 'Credit')])

    is_postable = models.BooleanField(default=True, help_text="Only postable accounts can receive journal lines")
    is_active = models.BooleanField(default=True)

    description = models.TextField(blank=True)
    currency_restriction = models.CharField(
        max_length=3,
        blank=True,
        null=True,
        help_text="If set, only this currency can post. ISO 4217."
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'accounts'
        constraints = [
            models.UniqueConstraint(fields=['entity', 'code'], name='unique_account_code_per_entity'),
        ]
        indexes = [
            models.Index(fields=['entity', 'account_type']),
            models.Index(fields=['entity', 'is_postable']),
        ]

    def __str__(self):
        return f"{self.entity.legal_name} {self.code} {self.name}"


class JournalEntry(models.Model):
    """
    A journal entry in an entity's books.

    Statuses:
    - draft: being composed, can be modified
    - posted: immutable, locked into period, affects trial balance
    - reversed: reversed by another entry, but kept for audit trail

    The entry is denominated in transaction_currency.
    Must have >= 2 lines, balancing in both transaction and functional currency.
    """

    STATUSES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('reversed', 'Reversed'),
    ]

    SOURCES = [
        ('manual', 'Manual'),
        ('ap', 'Accounts Payable'),
        ('ar', 'Accounts Receivable'),
        ('bank_recon', 'Bank Reconciliation'),
        ('system', 'System'),
        ('import', 'Import'),
        ('consolidation', 'Consolidation'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.PROTECT, related_name='journal_entries')

    entry_number = models.CharField(max_length=50, help_text="Sequential per entity, server-generated")
    entry_date = models.DateField()
    period = models.ForeignKey(Period, on_delete=models.PROTECT, related_name='entries')

    description = models.TextField()
    reference = models.CharField(max_length=100, blank=True, null=True, help_text="Invoice #, check #, etc.")

    status = models.CharField(max_length=20, choices=STATUSES, default='draft')

    reverses_entry = models.ForeignKey(
        'self',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='reversing_entries'
    )
    reversed_by_entry = models.ForeignKey(
        'self',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="Set when this entry is reversed"
    )

    source = models.CharField(max_length=20, choices=SOURCES, default='manual')

    transaction_currency = models.CharField(max_length=3, help_text="ISO 4217")
    intercompany_pair_id = models.UUIDField(null=True, blank=True, help_text="Links to counterparty entry")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')

    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='+')

    class Meta:
        db_table = 'journal_entries'
        indexes = [
            models.Index(fields=['entity', 'entry_date']),
            models.Index(fields=['period', 'status']),
            models.Index(fields=['intercompany_pair_id']),
        ]

    def __str__(self):
        return f"{self.entity.legal_name} {self.entry_number} {self.entry_date}"


class JournalLine(models.Model):
    """
    A single line in a journal entry.

    Exactly one of (debit, credit) is non-zero.
    currency is usually = entry's transaction_currency.
    functional_amount is signed (negative for credit) and in the entity's functional currency.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.PROTECT, related_name='lines')
    line_number = models.PositiveIntegerField()

    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='journal_lines')

    debit = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal('0'), validators=[MinValueValidator(Decimal('0'))])
    credit = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal('0'), validators=[MinValueValidator(Decimal('0'))])
    currency = models.CharField(max_length=3, help_text="ISO 4217")

    description = models.TextField(blank=True)

    functional_amount = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        help_text="Signed amount in entity's functional currency; negative for credit"
    )

    dimension_values = models.JSONField(default=dict, blank=True, help_text="{department: uuid, class: uuid, ...}")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'journal_lines'
        constraints = [
            models.CheckConstraint(
                check=~(
                    models.Q(debit__gt=0) & models.Q(credit__gt=0)
                ),
                name='one_of_debit_credit'
            ),
        ]
        indexes = [
            models.Index(fields=['journal_entry', 'line_number']),
            models.Index(fields=['account', 'journal_entry']),
        ]

    def __str__(self):
        side = 'Dr' if self.debit > 0 else 'Cr'
        amount = self.debit if self.debit > 0 else self.credit
        return f"{self.account.name} {side} {amount} {self.currency}"


# ============================================================================
# Multi-Currency & FX Models
# ============================================================================

class FXRate(models.Model):
    """
    Currency exchange rates with date-effective precision.

    Convention: store both directions (USD→EUR AND EUR→USD) or compute on the fly.
    For now, store both directions explicitly.

    rate = how many `to_currency` units per 1 `from_currency` unit.
    Example: from_currency=USD, to_currency=EUR, rate=0.92 means 1 USD = 0.92 EUR
    """

    RATE_TYPES = [
        ('spot', 'Spot'),
        ('average', 'Average'),
        ('closing', 'Closing'),
    ]

    SOURCES = [
        ('manual', 'Manual'),
        ('xe', 'XE.com'),
        ('oanda', 'OANDA'),
        ('fed_h10', 'Federal Reserve H.10'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    from_currency = models.CharField(max_length=3, help_text="ISO 4217")
    to_currency = models.CharField(max_length=3, help_text="ISO 4217")
    rate = models.DecimalField(
        max_digits=18,
        decimal_places=8,
        validators=[MinValueValidator(Decimal('0'))],
        help_text="Precision for small-value or high-precision currency pairs"
    )
    effective_date = models.DateField(help_text="Date this rate is effective")

    source = models.CharField(max_length=20, choices=SOURCES, default='manual')
    rate_type = models.CharField(max_length=20, choices=RATE_TYPES, default='spot')

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = 'fx_rates'
        constraints = [
            models.UniqueConstraint(
                fields=['from_currency', 'to_currency', 'effective_date', 'rate_type'],
                name='unique_fx_rate'
            ),
        ]
        indexes = [
            models.Index(fields=['from_currency', 'to_currency', 'effective_date']),
            models.Index(fields=['effective_date']),
        ]

    def __str__(self):
        return f"{self.from_currency}→{self.to_currency} {self.rate} ({self.effective_date})"


class TransactionFX(models.Model):
    """
    FX metadata on a journal entry.

    Tracks:
    - the FX rate used to convert each line to functional currency
    - the source of the rate (which FXRate record)
    - any FX gain/loss if this is a period-end remeasurement
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    journal_entry = models.OneToOneField(JournalEntry, on_delete=models.PROTECT, related_name='fx_data')

    transaction_currency = models.CharField(max_length=3, help_text="ISO 4217")
    functional_currency = models.CharField(max_length=3, help_text="ISO 4217")

    conversion_rate = models.DecimalField(
        max_digits=18,
        decimal_places=8,
        help_text="Rate used for transaction-to-functional conversion"
    )

    fx_rate = models.ForeignKey(
        FXRate,
        on_delete=models.PROTECT,
        related_name='+',
        help_text="The FXRate record this conversion used"
    )

    total_transaction_amount = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        help_text="Sum of absolute values of all lines in transaction currency"
    )
    total_functional_amount = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        help_text="Sum of absolute values of all lines in functional currency"
    )

    fx_gain_loss = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        null=True,
        blank=True,
        help_text="FX gain/loss if this is a period-end remeasurement entry"
    )

    is_remeasurement = models.BooleanField(default=False, help_text="True if this is a period-end FX entry")

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = 'transaction_fx'
        indexes = [
            models.Index(fields=['journal_entry']),
            models.Index(fields=['transaction_currency', 'functional_currency']),
        ]

    def __str__(self):
        return f"FX {self.transaction_currency}→{self.functional_currency} @ {self.conversion_rate}"


class PeriodEndRevaluation(models.Model):
    """
    A batch job that remeasures foreign-currency monetary balances at period end.

    Per ASC 830, remeasure all foreign-currency-denominated monetary assets/liabilities
    to the current (period-end) rate. Post FX gain/loss entries.

    Statuses:
    - draft: configuration, not yet executed
    - completed: all entries posted
    - rolled_back: entries reversed (if needed for correction)
    """

    STATUSES = [
        ('draft', 'Draft'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('rolled_back', 'Rolled Back'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.PROTECT, related_name='period_revaluations')
    period = models.ForeignKey(Period, on_delete=models.PROTECT, related_name='revaluations')

    status = models.CharField(max_length=20, choices=STATUSES, default='draft')

    description = models.TextField(blank=True, help_text="Why this revaluation is being done (correction, period-end, etc.)")

    period_end_rate_date = models.DateField(help_text="Date of the period-end FX rates used")

    total_fx_gain = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        help_text="Total realized/unrealized FX gain for the period"
    )
    total_fx_loss = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        help_text="Total realized/unrealized FX loss for the period"
    )

    started_at = models.DateTimeField(null=True, blank=True)
    started_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='+')

    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='+')

    rolled_back_at = models.DateTimeField(null=True, blank=True)
    rolled_back_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    rollback_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = 'period_end_revaluations'
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'period'],
                condition=models.Q(status__in=['draft', 'in_progress', 'completed']),
                name='one_active_revaluation_per_entity_period'
            ),
        ]
        indexes = [
            models.Index(fields=['entity', 'period']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.entity.legal_name} {self.period} Revaluation"


class PeriodEndRevaluationLine(models.Model):
    """
    Detail of a single account's FX revaluation in a PeriodEndRevaluation batch.

    Records:
    - which account was remeasured
    - old balance (in transaction currency)
    - new balance (at period-end rate)
    - the FX gain/loss posted
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    revaluation = models.ForeignKey(
        PeriodEndRevaluation,
        on_delete=models.PROTECT,
        related_name='lines'
    )

    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='+')
    transaction_currency = models.CharField(max_length=3, help_text="ISO 4217")

    opening_balance_tc = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        help_text="Balance in transaction currency at start of period"
    )
    prior_rate = models.DecimalField(
        max_digits=18,
        decimal_places=8,
        help_text="FX rate used in previous period"
    )
    opening_balance_fc = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        help_text="Balance in functional currency at start of period"
    )

    period_end_rate = models.DecimalField(
        max_digits=18,
        decimal_places=8,
        help_text="FX rate at period-end"
    )
    remeasured_balance_fc = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        help_text="Remeasured balance in functional currency at period-end"
    )

    fx_adjustment = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        help_text="Signed FX gain (+) or loss (-) in functional currency"
    )

    revaluation_entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
        help_text="The JournalEntry posted for this revaluation"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = 'period_end_revaluation_lines'
        indexes = [
            models.Index(fields=['revaluation', 'account']),
        ]

    def __str__(self):
        return f"{self.account.name} FX {self.transaction_currency} adjustment"


# ============================================================================
# Consolidation & Translation Models
# ============================================================================

class ConsolidationAccount(models.Model):
    """
    Group-level chart of accounts for consolidated reporting.

    Many entity accounts map to one consolidation account.
    """

    ACCOUNT_TYPES = [
        ('asset', 'Asset'),
        ('liability', 'Liability'),
        ('equity', 'Equity'),
        ('revenue', 'Revenue'),
        ('expense', 'Expense'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)

    parent = models.ForeignKey('self', on_delete=models.PROTECT, null=True, blank=True, related_name='children')

    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPES)
    display_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'consolidation_accounts'
        indexes = [
            models.Index(fields=['account_type']),
        ]

    def __str__(self):
        return f"{self.code} {self.name}"


class ConsolidationMapping(models.Model):
    """
    Maps entity accounts to consolidation accounts.

    Many-to-one with effective dates.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.PROTECT, related_name='+')
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='+')
    consolidation_account = models.ForeignKey(ConsolidationAccount, on_delete=models.PROTECT, related_name='+')

    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True, help_text="null = current")

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = 'consolidation_mappings'
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'account', 'effective_from'],
                condition=models.Q(effective_to__isnull=True),
                name='one_current_mapping_per_account'
            ),
        ]
        indexes = [
            models.Index(fields=['entity', 'account']),
            models.Index(fields=['consolidation_account']),
        ]

    def __str__(self):
        return f"{self.entity.legal_name} {self.account.code} → {self.consolidation_account.code}"


class EntityOwnership(models.Model):
    """
    Multi-tier ownership relationships with effective dates.

    For consolidation: identifies which entities are part of the group.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent_entity = models.ForeignKey(Entity, on_delete=models.PROTECT, related_name='child_ownerships')
    child_entity = models.ForeignKey(Entity, on_delete=models.PROTECT, related_name='parent_ownerships')

    ownership_percent = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))]
    )

    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True, help_text="null = current")

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = 'entity_ownership'
        indexes = [
            models.Index(fields=['parent_entity', 'effective_from']),
            models.Index(fields=['child_entity']),
        ]

    def __str__(self):
        return f"{self.parent_entity.legal_name} owns {self.child_entity.legal_name} {self.ownership_percent}%"


# ============================================================================
# Audit Log
# ============================================================================

class AuditLog(models.Model):
    """
    Append-only transaction log.

    Captured via Postgres triggers for every INSERT, UPDATE, DELETE on financial tables.
    UPDATE and DELETE operations on this table are forbidden.
    """

    ACTIONS = [
        ('insert', 'Insert'),
        ('update', 'Update'),
        ('delete', 'Delete'),
    ]

    id = models.BigAutoField(primary_key=True)
    occurred_at = models.DateTimeField(auto_now_add=True, db_index=True)

    actor = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name='+')
    action = models.CharField(max_length=20, choices=ACTIONS)

    table_name = models.CharField(max_length=100)
    record_id = models.UUIDField()

    before_state = models.JSONField(null=True, blank=True)
    after_state = models.JSONField(null=True, blank=True)

    reason = models.TextField(blank=True, help_text="Why this change was made")

    class Meta:
        db_table = 'audit_log'
        indexes = [
            models.Index(fields=['table_name', 'record_id']),
            models.Index(fields=['occurred_at']),
            models.Index(fields=['actor', 'occurred_at']),
        ]

    def __str__(self):
        return f"{self.action} on {self.table_name} at {self.occurred_at}"


# ============================================================================
# Intercompany & Consolidation Models (Phase 2)
# ============================================================================

class IntercompanyTransaction(models.Model):
    """
    Paired GL entries in two entities that must match before consolidation.

    Represents a transaction between two entities (e.g., intercompany sale, loan, allocation).
    Both sender_entry and receiver_entry reference the same logical transaction.

    Invariants:
    - sender_entry and receiver_entry are in different entities
    - Amounts must match in transaction currency (rounding tolerance configurable)
    - status tracks resolution: draft → matched → mismatched → resolved
    """

    class Status(models.TextChoices):
        DRAFT = 'draft', _('Draft')
        MATCHED = 'matched', _('Matched')
        MISMATCHED = 'mismatched', _('Mismatched')
        RESOLVED = 'resolved', _('Resolved')

    class MismatchType(models.TextChoices):
        AMOUNT = 'amount', _('Amount Mismatch')
        CURRENCY = 'currency', _('Currency Mismatch')
        DATE = 'date', _('Date Mismatch')
        ACCOUNT = 'account', _('Account Mismatch')
        MISSING_PAIR = 'missing_pair', _('Missing Pair')
        OTHER = 'other', _('Other')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Both entries reference the same logical transaction
    sender_entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.PROTECT,
        related_name='sent_intercompany'
    )
    receiver_entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.PROTECT,
        related_name='received_intercompany'
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )

    # Mismatch tracking
    mismatch_type = models.CharField(
        max_length=50,
        choices=MismatchType.choices,
        null=True,
        blank=True
    )
    mismatch_detail = models.TextField(blank=True)
    tolerance_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0.00')  # 0% = exact match required
    )

    # Resolution
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='intercompany_resolutions'
    )
    resolution_notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = 'intercompany_transactions'
        indexes = [
            models.Index(fields=['sender_entry', 'receiver_entry']),
            models.Index(fields=['status']),
            models.Index(fields=['mismatch_type']),
        ]

    def __str__(self):
        return f"IC {self.sender_entry.entity.legal_name} → {self.receiver_entry.entity.legal_name}"


class ConsolidationRun(models.Model):
    """
    A specific consolidation execution. State machine: in_progress → complete or blocked.

    Invariants:
    - as_of_date must be in a closed period for all entities in scope
    - parent_entity must exist and be the top of the group
    - Cannot consolidate if intercompany transactions are mismatched
    """

    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', _('In Progress')
        COMPLETE = 'complete', _('Complete')
        BLOCKED = 'blocked', _('Blocked - Unresolved Issues')
        FINALIZED = 'finalized', _('Finalized')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    as_of_date = models.DateField()
    reporting_currency = models.CharField(max_length=3, default='USD')
    parent_entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        related_name='consolidation_runs_as_parent'
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_PROGRESS
    )

    # Execution metadata
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    executed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='consolidations_executed')
    notes = models.TextField(blank=True)

    # Scope: list of entity UUIDs in scope
    entities_in_scope = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'consolidation_runs'
        indexes = [
            models.Index(fields=['parent_entity', 'as_of_date']),
            models.Index(fields=['status']),
        ]
        ordering = ['-as_of_date', '-started_at']

    def __str__(self):
        return f"Consolidation {self.as_of_date} - {self.get_status_display()}"


class ConsolidationAdjustment(models.Model):
    """
    Adjustments that live on the consolidation layer, not in entity books.
    Includes eliminations, basis normalizations, translations, and reclassifications.

    Invariants:
    - References consolidation_accounts, not entity accounts
    - Lines sum to zero in reporting currency
    - Cannot modify after status = 'applied'
    """

    class AdjustmentType(models.TextChoices):
        ELIMINATION = 'elimination', _('Elimination')
        BASIS_NORMALIZATION = 'basis_normalization', _('Basis Normalization')
        RECLASSIFICATION = 'reclassification', _('Reclassification')
        TRANSLATION = 'translation', _('Translation / CTA')
        MINORITY_INTEREST = 'minority_interest', _('Minority Interest')

    class AdjustmentStatus(models.TextChoices):
        DRAFT = 'draft', _('Draft')
        APPLIED = 'applied', _('Applied')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consolidation_run = models.ForeignKey(
        ConsolidationRun,
        on_delete=models.CASCADE,
        related_name='adjustments'
    )

    adjustment_type = models.CharField(max_length=50, choices=AdjustmentType.choices)
    description = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=AdjustmentStatus.choices,
        default=AdjustmentStatus.DRAFT
    )

    # Link to intercompany transaction if elimination
    intercompany_transaction = models.ForeignKey(
        IntercompanyTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='elimination_adjustments'
    )

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    updated_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')

    class Meta:
        db_table = 'consolidation_adjustments'
        indexes = [
            models.Index(fields=['consolidation_run', 'adjustment_type']),
            models.Index(fields=['consolidation_run', 'status']),
        ]

    def __str__(self):
        return f"{self.get_adjustment_type_display()}: {self.description}"


class ConsolidationAdjustmentLine(models.Model):
    """
    Line items within a consolidation adjustment.
    References consolidation accounts, not entity accounts.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    adjustment = models.ForeignKey(
        ConsolidationAdjustment,
        on_delete=models.CASCADE,
        related_name='lines'
    )
    line_number = models.PositiveIntegerField()

    consolidation_account = models.ForeignKey(ConsolidationAccount, on_delete=models.PROTECT)
    debit = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal('0'))
    credit = models.DecimalField(max_digits=20, decimal_places=4, default=Decimal('0'))
    currency = models.CharField(max_length=3, default='USD')

    description = models.TextField(blank=True)

    class Meta:
        db_table = 'consolidation_adjustment_lines'
        ordering = ['adjustment', 'line_number']
        constraints = [
            models.CheckConstraint(
                check=~(
                    models.Q(debit__gt=0) & models.Q(credit__gt=0)
                ),
                name='adj_exactly_one_debit_or_credit'
            ),
        ]

    def __str__(self):
        return f"{self.consolidation_account.code} {self.debit or self.credit}"


# ============================================================================
# Dimensions (Phase 1)
# ============================================================================

class Dimension(models.Model):
    """
    Configurable dimension types (department, class, location, project) per entity.
    Allows cost allocation and drill-down reporting.
    """

    class DimensionType(models.TextChoices):
        DEPARTMENT = 'department', _('Department')
        CLASS = 'class', _('Class')
        LOCATION = 'location', _('Location')
        PROJECT = 'project', _('Project')
        CUSTOM = 'custom', _('Custom')

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE, related_name='dimensions')

    dimension_type = models.CharField(max_length=50, choices=DimensionType.choices)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dimensions'
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'dimension_type', 'code'],
                name='unique_dimension_per_entity'
            ),
        ]
        ordering = ['entity', 'dimension_type', 'code']

    def __str__(self):
        return f"{self.get_dimension_type_display()}: {self.name}"
