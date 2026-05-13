"""
Finance models: Chart of Accounts, Journal Entry, Journal Line, General Ledger, Audit Log.

References:
- CLAUDE.md: Non-negotiable accounting invariants (double-entry, immutability, audit log)
- docs/data-model.md: Complete schema design
- docs/accounting-rules.md: Business rule enforcement

Key invariants implemented at model and database level:
1. Double-entry integrity: sum(debits) == sum(credits) at DB level via trigger
2. Money is ALWAYS Decimal(20, 4); currency stored alongside every amount
3. Posted entries immutable (enforced via triggers and model validation)
4. Entity scoping on every financial record
5. Audit log captures every mutation (via Postgres triggers)
"""
import uuid
from decimal import Decimal, ROUND_HALF_EVEN
from typing import Optional

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.core.models import Entity, User


class Account(models.Model):
    """
    Per-entity Chart of Accounts.

    Per docs/data-model.md: accounts table.
    Hierarchical within entity (parent_id for hierarchy).

    Invariants (db-level):
    - (entity_id, code) unique
    - Non-postable accounts cannot have journal lines
    - Postable accounts cannot have children (leaf-only)
    - Account active and postable at line posting time
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        related_name='accounts',
        help_text="Entity this account belongs to"
    )

    code = models.CharField(
        max_length=20,
        help_text="Account number (e.g., '1010')"
    )
    name = models.CharField(
        max_length=255,
        help_text="Account name"
    )

    # Hierarchy (parent_id for tree structure)
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
        help_text="Parent account for hierarchy (null = top-level)"
    )

    # Account type and classification
    ACCOUNT_TYPE_CHOICES = [
        ('asset', _('Asset')),
        ('liability', _('Liability')),
        ('equity', _('Equity')),
        ('revenue', _('Revenue')),
        ('expense', _('Expense')),
    ]
    account_type = models.CharField(
        max_length=20,
        choices=ACCOUNT_TYPE_CHOICES,
        help_text="Asset, Liability, Equity, Revenue, or Expense"
    )

    ACCOUNT_SUBTYPE_CHOICES = [
        ('current_asset', _('Current Asset')),
        ('noncurrent_asset', _('Non-Current Asset')),
        ('current_liability', _('Current Liability')),
        ('noncurrent_liability', _('Non-Current Liability')),
        ('retained_earnings', _('Retained Earnings')),
        ('operating_revenue', _('Operating Revenue')),
        ('other_revenue', _('Other Revenue')),
        ('operating_expense', _('Operating Expense')),
        ('other_expense', _('Other Expense')),
        ('tax_expense', _('Tax Expense')),
    ]
    account_subtype = models.CharField(
        max_length=30,
        null=True,
        blank=True,
        choices=ACCOUNT_SUBTYPE_CHOICES,
        help_text="Refines account classification"
    )

    NORMAL_BALANCE_CHOICES = [
        ('debit', _('Debit')),
        ('credit', _('Credit')),
    ]
    normal_balance = models.CharField(
        max_length=10,
        choices=NORMAL_BALANCE_CHOICES,
        help_text="Debit or Credit increases the account"
    )

    # Posting controls
    is_postable = models.BooleanField(
        default=True,
        help_text="Leaf accounts postable; parents typically not"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive accounts cannot be posted to"
    )

    # Currency restriction (optional, for entities with single-currency accounts)
    currency_restriction = models.CharField(
        max_length=3,
        null=True,
        blank=True,
        help_text="If set, only this ISO 4217 currency posts; null = any currency"
    )

    description = models.TextField(
        blank=True,
        help_text="Extended account description"
    )

    # Audit trail
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='accounts_created',
        null=True,
        editable=False
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='accounts_updated',
        null=True,
        editable=False
    )

    # Soft delete
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'accounts'
        verbose_name = _('Account')
        verbose_name_plural = _('Accounts')
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'code'],
                name='unique_account_code_per_entity'
            ),
        ]
        indexes = [
            models.Index(fields=['entity', 'is_postable', 'is_active']),
            models.Index(fields=['entity', 'account_type']),
            models.Index(fields=['parent']),
        ]
        ordering = ['entity', 'code']

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"

    def is_deleted(self) -> bool:
        """Check if account is soft-deleted."""
        return self.deleted_at is not None


class Period(models.Model):
    """
    Per-entity accounting period calendar.

    Per docs/data-model.md: periods table.
    Per CLAUDE.md: period locks prevent posting to closed/locked periods.

    Invariants (db-level):
    - Periods of same type do not overlap within an entity (exclusion constraint)
    - Posting to non-open period rejected at DB level
    - Locked period cannot transition to any other status
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        related_name='periods'
    )

    PERIOD_TYPE_CHOICES = [
        ('month', _('Monthly')),
        ('quarter', _('Quarterly')),
        ('year', _('Annual')),
        ('stub', _('Stub Period')),
    ]
    period_type = models.CharField(
        max_length=10,
        choices=PERIOD_TYPE_CHOICES,
        help_text="Month, Quarter, Year, or Stub"
    )

    start_date = models.DateField()
    end_date = models.DateField()

    STATUS_CHOICES = [
        ('open', _('Open')),
        ('closed', _('Closed')),
        ('locked', _('Locked')),
    ]
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='open',
        help_text="Open (posting allowed), Closed (requires reopen), Locked (permanent)"
    )

    # Close tracking
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='periods_closed'
    )

    # Lock tracking
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='periods_locked'
    )

    class Meta:
        db_table = 'periods'
        verbose_name = _('Period')
        verbose_name_plural = _('Periods')
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'start_date', 'end_date'],
                name='unique_period_per_entity'
            ),
        ]
        indexes = [
            models.Index(fields=['entity', 'status']),
            models.Index(fields=['entity', 'start_date', 'end_date']),
        ]
        ordering = ['entity', 'start_date']

    def __str__(self) -> str:
        return f"{self.entity.legal_name} {self.period_type}: {self.start_date} - {self.end_date}"

    def is_open(self) -> bool:
        """Check if period is open for posting."""
        return self.status == 'open'

    def is_locked(self) -> bool:
        """Check if period is locked (permanent)."""
        return self.status == 'locked'


class FXRate(models.Model):
    """
    Foreign exchange rates with effective dates.

    Per docs/data-model.md: fx_rates table.
    Per CLAUDE.md: FX rates stored as numeric(18, 8) for precision.
    Per docs/accounting-rules.md: rates effective on transaction date, not today's rate.

    Invariants (db-level):
    - (from_currency, to_currency, effective_date, rate_type) unique
    Convention: store inverse pairs (USD→EUR AND EUR→USD) or compute on the fly.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    from_currency = models.CharField(max_length=3, help_text="ISO 4217 source currency")
    to_currency = models.CharField(max_length=3, help_text="ISO 4217 target currency")

    # Rate with high precision (8 decimal places)
    rate = models.DecimalField(
        max_digits=18,
        decimal_places=8,
        help_text="How many 'to' per 1 'from'"
    )

    effective_date = models.DateField(
        help_text="Date this rate became effective"
    )

    RATE_SOURCE_CHOICES = [
        ('manual', _('Manual')),
        ('xe', _('XE.com')),
        ('oanda', _('OANDA')),
        ('fed_h10', _('Federal Reserve H.10')),
    ]
    source = models.CharField(
        max_length=20,
        choices=RATE_SOURCE_CHOICES,
        help_text="Source of the rate (manual or API)"
    )

    RATE_TYPE_CHOICES = [
        ('spot', _('Spot')),
        ('average', _('Average')),
        ('closing', _('Closing')),
    ]
    rate_type = models.CharField(
        max_length=10,
        choices=RATE_TYPE_CHOICES,
        default='spot',
        help_text="Spot (transaction-date), Average (period), or Closing (period-end)"
    )

    # Audit trail
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        editable=False,
        related_name='fx_rates_created'
    )

    class Meta:
        db_table = 'fx_rates'
        verbose_name = _('FX Rate')
        verbose_name_plural = _('FX Rates')
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
        ordering = ['-effective_date', 'from_currency', 'to_currency']

    def __str__(self) -> str:
        return f"1 {self.from_currency} = {self.rate} {self.to_currency} ({self.effective_date})"


class JournalEntry(models.Model):
    """
    Accounting transaction header.

    Per docs/data-model.md: journal_entries table.
    Per CLAUDE.md invariants: immutable once posted, reversible, double-entry enforced.

    Key fields:
    - status: draft, posted, reversed
    - transaction_currency: currency the entry is denominated in
    - Must have ≥2 journal_lines balancing to zero in transaction_currency
    - Once posted, immutable except for reversed_by_entry_id link

    Invariants (db-level):
    - Posted entries cannot be updated (except reversed_by_entry_id)
    - Created_by != posted_by by default (SoD); can override
    - Must have ≥2 journal lines balancing to zero in transaction_currency
    - If intercompany, counterparty entry must exist and match in absolute amount
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        related_name='journal_entries'
    )

    # Entry numbering (sequential per entity)
    entry_number = models.CharField(
        max_length=20,
        help_text="Server-generated, sequential per entity"
    )

    # Accounting date
    entry_date = models.DateField(help_text="Accounting date for the transaction")
    period = models.ForeignKey(
        Period,
        on_delete=models.PROTECT,
        null=True,
        help_text="Derived from entry_date + entity; stored for indexing"
    )

    # Description and reference
    description = models.TextField(help_text="Transaction description")
    reference = models.CharField(
        max_length=255,
        blank=True,
        help_text="External reference (invoice #, check #, etc.)"
    )

    # Transaction currency (all lines must sum to 0 in this currency)
    transaction_currency = models.CharField(
        max_length=3,
        help_text="ISO 4217 currency the entry is denominated in"
    )

    # Status and lifecycle
    STATUS_CHOICES = [
        ('draft', _('Draft')),
        ('posted', _('Posted')),
        ('reversed', _('Reversed')),
    ]
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='draft',
        help_text="Draft (mutable), Posted (immutable), Reversed (cancelled via reversal entry)"
    )

    # Reversal tracking
    reverses_entry = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='reversed_by_entries',
        help_text="If this reverses another entry, reference to the original"
    )
    reversed_by_entry = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='reverses',
        help_text="If reversed by another entry, reference to the reversal"
    )

    # Source tracking (for audit and reconciliation)
    SOURCE_CHOICES = [
        ('manual', _('Manual')),
        ('ap', _('Accounts Payable')),
        ('ar', _('Accounts Receivable')),
        ('bank_recon', _('Bank Reconciliation')),
        ('system', _('System')),
        ('import', _('Import')),
        ('consolidation', _('Consolidation')),
    ]
    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default='manual'
    )

    # Intercompany tracking
    intercompany_pair_id = models.UUIDField(
        null=True,
        blank=True,
        help_text="If intercompany, unique ID linking to matching entry in counterparty"
    )

    # Posting tracking (per CLAUDE.md: created_by != posted_by for SoD)
    posted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when entry was posted; null if still draft"
    )
    posted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='journal_entries_posted'
    )

    # SoD override flag (audit-logged)
    same_user_override = models.BooleanField(
        default=False,
        help_text="If True, created_by == posted_by; override for SoD enforcement"
    )

    # Audit trail
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='journal_entries_created'
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='journal_entries_updated'
    )

    # Soft delete
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'journal_entries'
        verbose_name = _('Journal Entry')
        verbose_name_plural = _('Journal Entries')
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'entry_number'],
                name='unique_entry_number_per_entity'
            ),
        ]
        indexes = [
            models.Index(fields=['entity', 'entry_date']),
            models.Index(fields=['entity', 'status']),
            models.Index(fields=['period', 'status']),
            models.Index(fields=['intercompany_pair_id']),
        ]
        ordering = ['-entry_date', '-created_at']

    def __str__(self) -> str:
        return f"JE {self.entry_number} ({self.status}) - {self.entry_date}: {self.description[:50]}"

    def is_posted(self) -> bool:
        """Check if entry is posted (immutable)."""
        return self.status == 'posted'

    def is_draft(self) -> bool:
        """Check if entry is draft (mutable)."""
        return self.status == 'draft'

    def is_reversed(self) -> bool:
        """Check if entry is reversed."""
        return self.status == 'reversed'


class JournalLine(models.Model):
    """
    Individual line item in a journal entry (debit/credit pair).

    Per docs/data-model.md: journal_lines table.
    Per CLAUDE.md: money is ALWAYS Decimal(20, 4) with currency.

    Key invariants (db-level):
    - Exactly one of (debit, credit) non-zero
    - Per entry: sum(debit) = sum(credit) in transaction_currency (deferred DB constraint)
    - Per entry: sum(functional_amount) = 0 (signed amounts)
    - Account postable, active, belongs to entry's entity
    - Cannot post to a posted entry (enforced via trigger)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    journal_entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.CASCADE,
        related_name='lines'
    )

    # Line ordering
    line_number = models.PositiveIntegerField(help_text="Sequence within entry")

    # Account and posting
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='journal_lines'
    )

    # Debit/credit amounts (both in transaction currency)
    # Per CLAUDE.md: ALWAYS Decimal with 4 decimal places for precision
    debit = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0.0000'),
        help_text="Debit amount in transaction currency"
    )
    credit = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0.0000'),
        help_text="Credit amount in transaction currency"
    )

    # Currency (typically matches entry's transaction_currency)
    currency = models.CharField(
        max_length=3,
        help_text="ISO 4217 currency of this line (usually = transaction_currency)"
    )

    # Functional currency amount (signed: negative for credit)
    functional_amount = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0.0000'),
        help_text="Translated to entity's functional currency at entry date FX rate (signed)"
    )

    # Description
    description = models.TextField(blank=True)

    # Dimensions (per docs/data-model.md: dimension_values jsonb)
    dimension_values = models.JSONField(
        default=dict,
        blank=True,
        help_text="{department: uuid, class: uuid, location: uuid, project: uuid}"
    )

    class Meta:
        db_table = 'journal_lines'
        verbose_name = _('Journal Line')
        verbose_name_plural = _('Journal Lines')
        constraints = [
            models.CheckConstraint(
                check=models.Q(debit__gt=Decimal('0')) | models.Q(credit__gt=Decimal('0')),
                name='journal_line_must_have_debit_or_credit'
            ),
        ]
        indexes = [
            models.Index(fields=['journal_entry']),
            models.Index(fields=['account', 'journal_entry']),
        ]
        ordering = ['journal_entry', 'line_number']
        unique_together = [('journal_entry', 'line_number')]

    def __str__(self) -> str:
        amount = self.debit if self.debit > 0 else self.credit
        side = 'DR' if self.debit > 0 else 'CR'
        return f"Line {self.line_number}: {self.account.code} {side} {amount}"

    def is_debit(self) -> bool:
        """Check if line is a debit."""
        return self.debit > Decimal('0')

    def is_credit(self) -> bool:
        """Check if line is a credit."""
        return self.credit > Decimal('0')

    def amount(self) -> Decimal:
        """Get the absolute amount of this line."""
        return self.debit if self.is_debit() else self.credit


class GeneralLedger(models.Model):
    """
    General Ledger balance table for reporting.

    Per docs/data-model.md: separate GL balance table for reporting efficiency.
    Populated via triggers as journal_lines are posted.

    Not directly posted to; updated by trigger on journal_line INSERT/UPDATE when posting.
    Denormalized for read-heavy reporting queries.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Scope
    entity = models.ForeignKey(
        Entity,
        on_delete=models.PROTECT,
        related_name='general_ledgers'
    )
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name='general_ledgers'
    )

    # Period scope
    period = models.ForeignKey(
        Period,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text="Period for which this GL balance applies"
    )

    # Cumulative balances (both transaction and functional currency)
    debit_transaction = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0.0000'),
        help_text="Total debits in transaction currency (if applicable)"
    )
    credit_transaction = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0.0000'),
        help_text="Total credits in transaction currency (if applicable)"
    )

    # Functional currency balance
    debit_functional = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0.0000'),
        help_text="Total debits in functional currency"
    )
    credit_functional = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0.0000'),
        help_text="Total credits in functional currency"
    )

    # Tracking
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'general_ledgers'
        verbose_name = _('General Ledger')
        verbose_name_plural = _('General Ledgers')
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'account', 'period'],
                name='unique_gl_per_entity_account_period'
            ),
        ]
        indexes = [
            models.Index(fields=['entity', 'period']),
            models.Index(fields=['account', 'period']),
        ]

    def __str__(self) -> str:
        balance = (self.debit_functional - self.credit_functional)
        return f"GL {self.account.code} @ {self.period}: {balance}"

    def balance(self) -> Decimal:
        """Get the account balance (in functional currency, signed)."""
        return self.debit_functional - self.credit_functional


class AuditLog(models.Model):
    """
    Immutable append-only audit log for all financial transactions.

    Per CLAUDE.md: captures every INSERT, UPDATE, DELETE on financial tables.
    Per docs/data-model.md: audit_log table with before/after state.

    Invariants (db-level):
    - INSERT only. UPDATE and DELETE on audit_log rejected via permissions and triggers.
    - Immutable; captures who changed what, when, before and after states.
    """

    id = models.BigAutoField(primary_key=True)

    occurred_at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_log_entries',
        help_text="User who triggered the change (from session GUC)"
    )

    # What changed
    ACTION_CHOICES = [
        ('insert', _('Insert')),
        ('update', _('Update')),
        ('delete', _('Delete')),
    ]
    action = models.CharField(
        max_length=10,
        choices=ACTION_CHOICES
    )

    table_name = models.CharField(max_length=50, db_index=True)
    record_id = models.UUIDField(db_index=True)

    # Before and after state
    before_state = models.JSONField(
        null=True,
        help_text="State before change (null for inserts)"
    )
    after_state = models.JSONField(
        null=True,
        help_text="State after change (null for deletes)"
    )

    # Reason (optional, for documented overrides or special cases)
    reason = models.TextField(
        blank=True,
        help_text="Optional explanation for the change (e.g., SoD override)"
    )

    class Meta:
        db_table = 'audit_log'
        verbose_name = _('Audit Log Entry')
        verbose_name_plural = _('Audit Log Entries')
        indexes = [
            models.Index(fields=['table_name', 'record_id', 'occurred_at']),
            models.Index(fields=['actor', 'occurred_at']),
        ]
        ordering = ['-occurred_at']
        permissions = [
            ('view_audit_log', 'Can view audit log'),
        ]

    def __str__(self) -> str:
        return f"{self.action.upper()} {self.table_name}({self.record_id}) @ {self.occurred_at}"
