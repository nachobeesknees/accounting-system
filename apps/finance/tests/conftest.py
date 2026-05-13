"""
Pytest configuration and shared fixtures for finance app tests.

Provides reusable fixtures for common test scenarios:
- Test entities and accounts
- Balanced journal entries
- FX rates
- Audit log verification
"""

import pytest
from decimal import Decimal
from datetime import date

from apps.core.models import Entity
from apps.coa.models import Account
from apps.finance.models import JournalEntry, Period
from apps.fx.models import FXRate

from .factories import (
    EntityFactory,
    UserFactory,
    PeriodFactory,
    AssetAccountFactory,
    LiabilityAccountFactory,
    EquityAccountFactory,
    ExpenseAccountFactory,
    RevenueAccountFactory,
    BalancedJournalEntryFactory,
    FXRatePairFactory,
)


# ============================================================================
# Entity & Account Fixtures
# ============================================================================


@pytest.fixture
def test_user():
    """Create a test user for audit tracking."""
    return UserFactory()


@pytest.fixture
def test_entity(test_user):
    """Create a test entity (USD, US jurisdiction)."""
    return EntityFactory(
        legal_name="Test Entity",
        functional_currency="USD",
        jurisdiction_country="US",
        created_by=test_user,
        updated_by=test_user,
    )


@pytest.fixture
def test_entity_eur(test_user):
    """Create a test entity with EUR functional currency."""
    return EntityFactory(
        legal_name="Test Entity EUR",
        functional_currency="EUR",
        jurisdiction_country="US",
        created_by=test_user,
        updated_by=test_user,
    )


@pytest.fixture
def multi_currency_entities(test_user):
    """Create multiple entities with different functional currencies."""
    return {
        "usd": EntityFactory(
            legal_name="USD Entity",
            functional_currency="USD",
            created_by=test_user,
        ),
        "eur": EntityFactory(
            legal_name="EUR Entity",
            functional_currency="EUR",
            created_by=test_user,
        ),
        "gbp": EntityFactory(
            legal_name="GBP Entity",
            functional_currency="GBP",
            created_by=test_user,
        ),
    }


@pytest.fixture
def test_period(test_entity, test_user):
    """Create an open accounting period."""
    return PeriodFactory(
        entity=test_entity,
        period_type="month",
        status="open",
        created_by=test_user,
        updated_by=test_user,
    )


@pytest.fixture
def closed_period(test_entity, test_user):
    """Create a closed accounting period."""
    return PeriodFactory(
        entity=test_entity,
        period_type="month",
        status="closed",
        created_by=test_user,
        updated_by=test_user,
    )


@pytest.fixture
def locked_period(test_entity, test_user):
    """Create a locked accounting period."""
    return PeriodFactory(
        entity=test_entity,
        period_type="month",
        status="locked",
        created_by=test_user,
        updated_by=test_user,
    )


# ============================================================================
# Chart of Accounts Fixtures
# ============================================================================


@pytest.fixture
def chart_of_accounts(test_entity, test_user):
    """Create a basic chart of accounts."""
    return {
        "asset": AssetAccountFactory(
            entity=test_entity,
            code="1010",
            name="Checking Account",
            created_by=test_user,
        ),
        "liability": LiabilityAccountFactory(
            entity=test_entity,
            code="2010",
            name="Accounts Payable",
            created_by=test_user,
        ),
        "equity": EquityAccountFactory(
            entity=test_entity,
            code="3010",
            name="Retained Earnings",
            created_by=test_user,
        ),
        "revenue": RevenueAccountFactory(
            entity=test_entity,
            code="4010",
            name="Service Revenue",
            created_by=test_user,
        ),
        "expense": ExpenseAccountFactory(
            entity=test_entity,
            code="5010",
            name="Operating Expense",
            created_by=test_user,
        ),
    }


@pytest.fixture
def multi_currency_accounts(test_entity_eur, test_user):
    """Create accounts restricted to different currencies."""
    return {
        "usd": AssetAccountFactory(
            entity=test_entity_eur,
            currency_restriction="USD",
            created_by=test_user,
        ),
        "eur": AssetAccountFactory(
            entity=test_entity_eur,
            currency_restriction="EUR",
            created_by=test_user,
        ),
        "gbp": LiabilityAccountFactory(
            entity=test_entity_eur,
            currency_restriction="GBP",
            created_by=test_user,
        ),
    }


# ============================================================================
# Journal Entry Fixtures
# ============================================================================


@pytest.fixture
def balanced_entry(test_entity, test_period, test_user):
    """Create a simple balanced journal entry."""
    return BalancedJournalEntryFactory(
        entity=test_entity,
        period=test_period,
        created_by=test_user,
        updated_by=test_user,
    )


@pytest.fixture
def sample_gl_entries(test_entity, test_period, test_user):
    """Create 10 balanced entries."""
    entries = []
    for i in range(10):
        entry = BalancedJournalEntryFactory(
            entity=test_entity,
            period=test_period,
            journal_code=f"GJ{i:06d}",
            created_by=test_user,
        )
        entries.append(entry)
    return entries


# ============================================================================
# FX Fixtures
# ============================================================================


@pytest.fixture
def fx_rates():
    """Create standard FX rate pairs for common currencies."""
    rates = {}

    # USD -> EUR
    rates["usd_eur"], rates["eur_usd"] = FXRatePairFactory.create_pair(
        "USD", "EUR", Decimal("0.92150000")
    )

    # USD -> GBP
    rates["usd_gbp"], rates["gbp_usd"] = FXRatePairFactory.create_pair(
        "USD", "GBP", Decimal("0.79100000")
    )

    # USD -> JPY
    rates["usd_jpy"], rates["jpy_usd"] = FXRatePairFactory.create_pair(
        "USD", "JPY", Decimal("149.50000000")
    )

    return rates


@pytest.fixture
def historical_fx_rates():
    """Create FX rates at different effective dates."""
    rates = []

    # Jan 1, 2024
    f, b = FXRatePairFactory.create_pair(
        "USD", "EUR", Decimal("0.92000000"), date(2024, 1, 1)
    )
    rates.extend([f, b])

    # Jul 1, 2024
    f, b = FXRatePairFactory.create_pair(
        "USD", "EUR", Decimal("0.93000000"), date(2024, 7, 1)
    )
    rates.extend([f, b])

    # Dec 31, 2024
    f, b = FXRatePairFactory.create_pair(
        "USD", "EUR", Decimal("0.91000000"), date(2024, 12, 31)
    )
    rates.extend([f, b])

    return rates


# ============================================================================
# Audit Log Fixtures
# ============================================================================


@pytest.fixture
def audit_log_entry_created(balanced_entry):
    """Get the audit log for entry creation."""
    from apps.audit.models import AuditLog

    logs = AuditLog.objects.filter(
        table_name="finance_journalentry",
        record_id=balanced_entry.id,
        operation="INSERT",
    )
    return logs.first() if logs.exists() else None


# ============================================================================
# Utility Fixtures
# ============================================================================


@pytest.fixture
def calculate_balance():
    """Helper function to calculate entry balance."""
    def _calculate(entry):
        lines = entry.journalline_set.all()
        return {
            "debits": sum(line.debit for line in lines),
            "credits": sum(line.credit for line in lines),
            "balanced": sum(line.debit for line in lines)
            == sum(line.credit for line in lines),
        }

    return _calculate


@pytest.fixture
def assert_entry_balanced(calculate_balance):
    """Helper to assert an entry is balanced."""
    def _assert(entry):
        balance = calculate_balance(entry)
        assert balance["balanced"], (
            f"Entry {entry.id} is not balanced: "
            f"debits={balance['debits']}, credits={balance['credits']}"
        )

    return _assert


# ============================================================================
# Markers
# ============================================================================


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow (stress/large data)"
    )
    config.addinivalue_line(
        "markers", "concurrency: mark test as concurrency test"
    )
    config.addinivalue_line(
        "markers", "property: mark test as property-based test"
    )
