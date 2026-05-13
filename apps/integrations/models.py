"""
Bank account, bank transaction, and reconciliation models.

Key invariants:
- Bank transaction amounts are immutable once created from bank feed (immutable = never updated from bank feed)
- Reconciliation is incomplete until book balance + statement balance agree (plus outstanding items)
- Corporate cards (Ramp, Amex) reconcile the same way as bank accounts
- Bank transaction amount must match GL entry amount exactly (no rounding)
"""

import uuid
from decimal import Decimal
from typing import Optional

from django.db import models
from django.core.validators import MinValueValidator
from django.utils.translation import gettext_lazy as _

from apps.core.models import BaseFinancialModel


class BankAccount(BaseFinancialModel):
    """
    Bank account or corporate card linked to an entity.

    Corporate cards (Ramp, Amex) are modeled as bank accounts with institution='ramp' or 'amex'.
    """

    INSTITUTION_CHOICES = [
        ('chase', _('Chase')),
        ('bofa', _('Bank of America')),
        ('wellsfargo', _('Wells Fargo')),
        ('citibank', _('Citibank')),
        ('amex', _('American Express')),
        ('ramp', _('Ramp')),
        ('other', _('Other')),
    ]

    STATUS_CHOICES = [
        ('active', _('Active')),
        ('inactive', _('Inactive')),
        ('archived', _('Archived')),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity_id = models.UUIDField()  # Foreign key to Entity (deferred until Entity model exists)

    # Account details
    account_name = models.CharField(max_length=255)
    institution = models.CharField(max_length=50, choices=INSTITUTION_CHOICES)
    account_number = models.CharField(max_length=100)  # Last 4 digits + masked, or full number for internal accounts

    # Currency
    functional_currency = models.CharField(max_length=3)  # ISO 4217

    # Plaid integration
    plaid_access_token = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Encrypted Plaid access token for this item"
    )
    plaid_item_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Plaid item ID for account monitoring"
    )

    # GL account linkage
    gl_account_id = models.UUIDField(
        null=True,
        blank=True,
        help_text="GL account for bank reconciliation adjustments"
    )

    # Balances (informational, derived from transactions)
    last_statement_date = models.DateField(null=True, blank=True)
    last_statement_balance = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        help_text="Balance per last statement"
    )

    # Reconciliation
    last_reconciliation_date = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    class Meta:
        db_table = 'bank_accounts'
        indexes = [
            models.Index(fields=['entity_id']),
            models.Index(fields=['plaid_item_id']),
            models.Index(fields=['institution']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['entity_id', 'account_number'],
                name='unique_entity_account_number'
            ),
        ]

    def __str__(self) -> str:
        return f"{self.account_name} ({self.institution}) - {self.functional_currency}"


class BankTransaction(BaseFinancialModel):
    """
    Bank transaction received from bank feed (Plaid, CSV import, etc).

    These are immutable once created — never updated based on bank feed.
    Reconciliation happens by matching GL entries to these transactions.
    """

    STATUS_CHOICES = [
        ('unmatched', _('Unmatched')),
        ('matched', _('Matched')),
        ('duplicate', _('Duplicate')),
        ('ignored', _('Ignored')),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_account_id = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        related_name='transactions'
    )

    # Transaction details from bank
    transaction_date = models.DateField()
    posted_date = models.DateField(null=True, blank=True)  # May differ from transaction_date
    amount = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        help_text="Transaction amount in account currency (signed: negative for withdrawals)"
    )
    description = models.TextField()

    # Bank reference
    plaid_transaction_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        unique=True,
        help_text="Unique ID from Plaid for deduplication"
    )
    external_reference = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Check number, invoice number, or other reference"
    )

    # Categorization
    merchant_name = models.CharField(max_length=255, null=True, blank=True)
    category = models.CharField(max_length=100, null=True, blank=True)

    # Matching
    matched_journal_entry_id = models.UUIDField(null=True, blank=True)
    matched_journal_line_id = models.UUIDField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='unmatched')

    class Meta:
        db_table = 'bank_transactions'
        indexes = [
            models.Index(fields=['bank_account_id']),
            models.Index(fields=['transaction_date']),
            models.Index(fields=['status']),
            models.Index(fields=['plaid_transaction_id']),
            models.Index(fields=['matched_journal_entry_id']),
        ]

    def __str__(self) -> str:
        return f"{self.transaction_date} | {self.amount} | {self.description[:50]}"


class BankReconciliation(BaseFinancialModel):
    """
    Bank reconciliation for a specific month/period.

    A reconciliation is INCOMPLETE until:
    - beginning_balance_per_books == last reconciliation's ending balance per books
    - statement_balance + outstanding_items_net_effect == book_balance
    - No unmatched items above threshold remain

    State machine: incomplete -> in_progress -> complete -> approved
    """

    STATUS_CHOICES = [
        ('incomplete', _('Incomplete')),
        ('in_progress', _('In Progress')),
        ('complete', _('Complete')),
        ('approved', _('Approved')),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_account_id = models.ForeignKey(
        BankAccount,
        on_delete=models.PROTECT,
        related_name='reconciliations'
    )

    # Period
    as_of_date = models.DateField()

    # Balances
    beginning_balance_per_books = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        help_text="Opening balance (from last recon or inception)"
    )
    statement_balance = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        help_text="Ending balance per statement"
    )
    book_balance = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        help_text="Calculated balance per books (transactions through as_of_date)"
    )

    # Calculated fields
    variance = models.DecimalField(
        max_digits=20,
        decimal_places=4,
        default=Decimal('0'),
        help_text="statement_balance - book_balance"
    )

    # Summary counts
    matched_count = models.IntegerField(default=0)
    unmatched_count = models.IntegerField(default=0)
    outstanding_items_count = models.IntegerField(default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='incomplete')

    # Approval
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = 'bank_reconciliations'
        indexes = [
            models.Index(fields=['bank_account_id']),
            models.Index(fields=['as_of_date']),
            models.Index(fields=['status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['bank_account_id', 'as_of_date'],
                name='unique_bank_account_period'
            ),
        ]

    def __str__(self) -> str:
        return f"{self.bank_account_id} | {self.as_of_date} | {self.status}"


class BankReconciliationLine(BaseFinancialModel):
    """
    A matched or unmatched item in a bank reconciliation.

    Types:
    - matched: bank transaction paired with GL entry
    - outstanding: GL entry not yet in bank
    - unmatched: bank transaction not yet matched to GL
    """

    TYPE_CHOICES = [
        ('matched', _('Matched')),
        ('outstanding', _('Outstanding')),
        ('unmatched', _('Unmatched')),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reconciliation_id = models.ForeignKey(
        BankReconciliation,
        on_delete=models.CASCADE,
        related_name='lines'
    )

    # Type
    line_type = models.CharField(max_length=20, choices=TYPE_CHOICES)

    # For matched and outstanding
    journal_entry_id = models.UUIDField(null=True, blank=True)
    journal_line_id = models.UUIDField(null=True, blank=True)

    # For matched and unmatched
    bank_transaction_id = models.ForeignKey(
        BankTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recon_lines'
    )

    # Amount (in bank account currency)
    amount = models.DecimalField(max_digits=20, decimal_places=4)

    # Description
    description = models.TextField()
    transaction_date = models.DateField()

    class Meta:
        db_table = 'bank_reconciliation_lines'
        indexes = [
            models.Index(fields=['reconciliation_id']),
            models.Index(fields=['line_type']),
            models.Index(fields=['journal_entry_id']),
        ]

    def __str__(self) -> str:
        return f"{self.line_type}: {self.amount} ({self.transaction_date})"
