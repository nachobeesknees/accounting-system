"""Pytest configuration and fixtures for finance tests."""
import datetime
from decimal import Decimal
from typing import Optional

import pytest
from django.utils import timezone

from apps.core.models import Entity, User
from apps.finance.models import (
    Account, FXRate, JournalEntry, JournalLine, Period,
)


@pytest.fixture
def user() -> User:
    """Create a test user."""
    return User.objects.create_user(
        username='testuser',
        email='test@example.com',
        password='testpass123'
    )


@pytest.fixture
def entity(user: User) -> Entity:
    """Create a test entity."""
    return Entity.objects.create(
        legal_name='Test Entity Inc.',
        entity_type='opco',
        jurisdiction_country='US',
        jurisdiction_state='CA',
        fiscal_year_end_month=12,
        fiscal_year_end_day=31,
        functional_currency='USD',
        accounting_basis='modified_cash',
        inception_date=datetime.date(2020, 1, 1),
        created_by=user,
    )


@pytest.fixture
def period(entity: Entity) -> Period:
    """Create a test accounting period."""
    return Period.objects.create(
        entity=entity,
        period_type='month',
        start_date=datetime.date(2024, 1, 1),
        end_date=datetime.date(2024, 1, 31),
        status='open',
    )


@pytest.fixture
def accounts(entity: Entity, user: User) -> dict:
    """Create test chart of accounts."""
    accounts_dict = {}

    # Asset accounts
    accounts_dict['cash'] = Account.objects.create(
        entity=entity,
        code='1010',
        name='Cash',
        account_type='asset',
        account_subtype='current_asset',
        normal_balance='debit',
        is_postable=True,
        is_active=True,
        created_by=user,
    )

    accounts_dict['ar'] = Account.objects.create(
        entity=entity,
        code='1200',
        name='Accounts Receivable',
        account_type='asset',
        account_subtype='current_asset',
        normal_balance='debit',
        is_postable=True,
        is_active=True,
        created_by=user,
    )

    # Liability accounts
    accounts_dict['ap'] = Account.objects.create(
        entity=entity,
        code='2100',
        name='Accounts Payable',
        account_type='liability',
        account_subtype='current_liability',
        normal_balance='credit',
        is_postable=True,
        is_active=True,
        created_by=user,
    )

    # Revenue accounts
    accounts_dict['revenue'] = Account.objects.create(
        entity=entity,
        code='4000',
        name='Operating Revenue',
        account_type='revenue',
        account_subtype='operating_revenue',
        normal_balance='credit',
        is_postable=True,
        is_active=True,
        created_by=user,
    )

    # Expense accounts
    accounts_dict['expense'] = Account.objects.create(
        entity=entity,
        code='5000',
        name='Operating Expenses',
        account_type='expense',
        account_subtype='operating_expense',
        normal_balance='debit',
        is_postable=True,
        is_active=True,
        created_by=user,
    )

    return accounts_dict


@pytest.fixture
def fx_rate_usd_eur(user: User) -> FXRate:
    """Create a USD to EUR FX rate."""
    return FXRate.objects.create(
        from_currency='USD',
        to_currency='EUR',
        rate=Decimal('0.92000000'),
        effective_date=datetime.date(2024, 1, 1),
        source='manual',
        rate_type='spot',
        created_by=user,
    )


@pytest.fixture
def journal_entry_draft(
    entity: Entity, period: Period, user: User, accounts: dict
) -> JournalEntry:
    """Create a draft journal entry."""
    entry = JournalEntry.objects.create(
        entity=entity,
        entry_number='JE-2024-001',
        entry_date=datetime.date(2024, 1, 15),
        period=period,
        description='Test transaction',
        reference='INV-001',
        transaction_currency='USD',
        status='draft',
        created_by=user,
    )

    # Add debit line
    JournalLine.objects.create(
        journal_entry=entry,
        line_number=1,
        account=accounts['cash'],
        debit=Decimal('1000.0000'),
        credit=Decimal('0.0000'),
        currency='USD',
        functional_amount=Decimal('1000.0000'),
    )

    # Add credit line
    JournalLine.objects.create(
        journal_entry=entry,
        line_number=2,
        account=accounts['revenue'],
        debit=Decimal('0.0000'),
        credit=Decimal('1000.0000'),
        currency='USD',
        functional_amount=Decimal('-1000.0000'),
    )

    return entry


@pytest.fixture
def journal_entry_posted(
    entity: Entity, period: Period, user: User, accounts: dict
) -> JournalEntry:
    """Create a posted journal entry."""
    entry = JournalEntry.objects.create(
        entity=entity,
        entry_number='JE-2024-002',
        entry_date=datetime.date(2024, 1, 20),
        period=period,
        description='Posted transaction',
        reference='INV-002',
        transaction_currency='USD',
        status='posted',
        posted_at=timezone.now(),
        posted_by=user,
        created_by=user,
    )

    # Add debit line
    JournalLine.objects.create(
        journal_entry=entry,
        line_number=1,
        account=accounts['cash'],
        debit=Decimal('5000.0000'),
        credit=Decimal('0.0000'),
        currency='USD',
        functional_amount=Decimal('5000.0000'),
    )

    # Add credit line
    JournalLine.objects.create(
        journal_entry=entry,
        line_number=2,
        account=accounts['ap'],
        debit=Decimal('0.0000'),
        credit=Decimal('5000.0000'),
        currency='USD',
        functional_amount=Decimal('-5000.0000'),
    )

    return entry
