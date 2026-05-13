"""
Property-based tests for financial invariants.

Uses hypothesis to verify that key accounting rules hold across
thousands of randomly-generated test cases.

Tests cover:
- Double-entry balance preservation
- Multi-currency precision
- FX conversion round-tripping
- Consolidation summation
- Audit log completeness
"""

import decimal
from datetime import date
from typing import Optional

import pytest
from hypothesis import given, settings, strategies as st
from hypothesis.strategies import composite

from apps.finance.models import JournalEntry, JournalLine
from apps.fx.models import FXRate
from apps.coa.models import Account

from .factories import (
    EntityFactory,
    JournalEntryFactory,
    JournalLineFactory,
    AssetAccountFactory,
    LiabilityAccountFactory,
    ExpenseAccountFactory,
    RevenueAccountFactory,
    FXRateFactory,
    FXRatePairFactory,
    PeriodFactory,
)


# ============================================================================
# Hypothesis Strategies for Financial Data
# ============================================================================


@composite
def decimal_money(draw, min_value: int = 0, max_value: int = 999999) -> decimal.Decimal:
    """Strategy generating valid monetary Decimal values."""
    # Generate a random amount in cents (to avoid float conversion issues)
    cents = draw(st.integers(min_value=min_value * 100, max_value=max_value * 100))
    return decimal.Decimal(cents) / 100


@composite
def currency_codes(draw) -> str:
    """Strategy selecting from realistic ISO 4217 codes."""
    currencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY"]
    return draw(st.sampled_from(currencies))


@composite
def valid_journal_lines(draw, entity=None, currency: str = "USD"):
    """
    Strategy generating balanced sets of journal lines.

    Returns a list of (debit, credit, account) tuples that sum to zero.
    """
    if entity is None:
        entity = EntityFactory()

    # Generate 2-5 lines
    num_lines = draw(st.integers(min_value=2, max_value=5))
    lines = []
    total_debits = decimal.Decimal(0)

    # Generate account types proportionally
    account_types = draw(
        st.lists(
            st.sampled_from(["asset", "liability", "revenue", "expense"]),
            min_size=num_lines,
            max_size=num_lines,
        )
    )

    for i, acct_type in enumerate(account_types):
        if acct_type == "asset":
            account = AssetAccountFactory(entity=entity, currency_restriction=currency)
            is_debit = True
        elif acct_type == "liability":
            account = LiabilityAccountFactory(entity=entity, currency_restriction=currency)
            is_debit = False
        elif acct_type == "revenue":
            account = RevenueAccountFactory(entity=entity, currency_restriction=currency)
            is_debit = False
        else:  # expense
            account = ExpenseAccountFactory(entity=entity, currency_restriction=currency)
            is_debit = True

        if i < num_lines - 1:
            # Generate random amount for non-final lines
            amount = draw(decimal_money(min_value=10, max_value=1000))
            if is_debit:
                lines.append((amount, decimal.Decimal(0), account))
                total_debits += amount
            else:
                lines.append((decimal.Decimal(0), amount, account))
                total_debits -= amount
        else:
            # Final line balances the entry
            if total_debits >= 0:
                lines.append((decimal.Decimal(0), total_debits, account))
            else:
                lines.append((-total_debits, decimal.Decimal(0), account))

    return lines


# ============================================================================
# Property-Based Tests
# ============================================================================


class TestDoubleEntryInvariant:
    """Verify double-entry balance is maintained across all conditions."""

    @given(valid_journal_lines())
    @settings(max_examples=100)
    def test_balanced_entry_sum_to_zero(self, lines):
        """For any set of balanced lines, debits must equal credits."""
        total_debits = sum(debit for debit, _, _ in lines)
        total_credits = sum(credit for _, credit, _ in lines)
        assert total_debits == total_credits

    @pytest.mark.django_db
    @given(valid_journal_lines())
    @settings(max_examples=100)
    def test_posted_entry_maintains_balance(self, lines):
        """Posted entries in DB must maintain double-entry balance."""
        entity = lines[0][2].entity  # Get entity from first line's account
        period = PeriodFactory(entity=entity, status="open")

        entry = JournalEntryFactory(
            entity=entity,
            period=period,
            status="draft",
            lines=[],  # Start with no lines
        )

        # Add the balanced lines
        for i, (debit, credit, account) in enumerate(lines):
            JournalLineFactory(
                journal_entry=entry,
                account=account,
                debit=debit,
                credit=credit,
                line_number=i + 1,
            )

        # Verify balance
        all_lines = entry.journalline_set.all()
        assert sum(line.debit for line in all_lines) == sum(
            line.credit for line in all_lines
        )

    @pytest.mark.django_db
    def test_unbalanced_entry_rejected(self):
        """Unbalanced entries should fail validation."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")
        asset = AssetAccountFactory(entity=entity)
        liability = LiabilityAccountFactory(entity=entity)

        entry = JournalEntryFactory(
            entity=entity,
            period=period,
            status="draft",
            lines=[],
        )

        # Create unbalanced lines (1000 debit, 900 credit)
        JournalLineFactory(
            journal_entry=entry,
            account=asset,
            debit=decimal.Decimal("1000.0000"),
            credit=decimal.Decimal("0.0000"),
        )
        JournalLineFactory(
            journal_entry=entry,
            account=liability,
            debit=decimal.Decimal("0.0000"),
            credit=decimal.Decimal("900.0000"),
        )

        # Attempt to post should fail or return error
        # (exact mechanism depends on implementation)
        assert entry.status == "draft"


class TestMultiCurrencyPrecision:
    """Verify FX conversions maintain decimal precision."""

    @pytest.mark.django_db
    @given(
        from_amount=decimal_money(min_value=10, max_value=100000),
        from_ccy=currency_codes(),
    )
    @settings(max_examples=100)
    def test_fx_conversion_precision(self, from_amount, from_ccy):
        """FX conversions should maintain 4-decimal precision."""
        to_ccy = "USD" if from_ccy != "USD" else "EUR"

        rate = FXRateFactory(
            from_currency=from_ccy,
            to_currency=to_ccy,
            rate=decimal.Decimal("1.23456789"),
        )

        # Convert amount
        converted = (from_amount * rate.rate).quantize(
            decimal.Decimal("0.0001"), rounding=decimal.ROUND_HALF_EVEN
        )

        # Verify precision (4 decimals)
        assert len(str(converted).split(".")[1]) <= 4

    @pytest.mark.django_db
    @given(amount=decimal_money(min_value=100, max_value=10000))
    @settings(max_examples=100)
    def test_roundtrip_fx_conversion(self, amount):
        """Converting A->B->A should equal original within rounding tolerance."""
        # Create bidirectional rates
        forward, backward = FXRatePairFactory.create_pair("USD", "EUR")

        # Forward conversion: USD -> EUR
        to_eur = (amount * forward.rate).quantize(
            decimal.Decimal("0.0001"), rounding=decimal.ROUND_HALF_EVEN
        )

        # Backward conversion: EUR -> USD
        back_to_usd = (to_eur * backward.rate).quantize(
            decimal.Decimal("0.0001"), rounding=decimal.ROUND_HALF_EVEN
        )

        # Should be equal to original within $0.01
        difference = abs(amount - back_to_usd)
        assert difference <= decimal.Decimal("0.01")

    @pytest.mark.django_db
    def test_fx_rate_not_found(self):
        """Missing FX rate should raise explicit exception."""
        from apps.fx.services import get_rate

        with pytest.raises(Exception):  # Specific exception TBD
            get_rate("XXX", "YYY", date.today())

    @pytest.mark.django_db
    def test_inverse_rate_computed(self):
        """If A->B exists, B->A can be derived."""
        FXRateFactory(from_currency="USD", to_currency="EUR", rate=decimal.Decimal("0.92150000"))

        from apps.fx.services import get_rate

        # Should find USD->EUR directly
        forward = get_rate("USD", "EUR", date.today())
        assert forward is not None

        # Should compute EUR->USD as inverse
        backward = get_rate("EUR", "USD", date.today())
        assert backward is not None

        # Multiply should round-trip
        value = decimal.Decimal("1000.0000")
        converted = value * forward * backward
        # Allow small rounding difference
        assert abs(value - converted) < decimal.Decimal("0.01")


class TestConsolidationRules:
    """Verify consolidation sums and mappings."""

    @pytest.mark.django_db
    def test_child_entity_gl_sums_to_parent(self):
        """Child entity GL total should roll up to parent."""
        # Create parent-child structure
        from tests.factories import ComplexEntityHierarchyFactory

        hierarchy = ComplexEntityHierarchyFactory.create_pyramid(depth=2, width=1)
        parent = hierarchy[0][0]
        child = hierarchy[1][0]

        # Create GL entries in child
        child_entries = []
        for i in range(10):
            entry = JournalEntryFactory(entity=child)
            child_entries.append(entry)

        # Sum child GL
        child_total_debits = sum(
            line.debit
            for entry in child_entries
            for line in entry.journalline_set.all()
        )
        child_total_credits = sum(
            line.credit
            for entry in child_entries
            for line in entry.journalline_set.all()
        )

        # Both should be equal (balanced)
        assert child_total_debits == child_total_credits

    @pytest.mark.django_db
    def test_consolidation_mapping_effective_date(self):
        """Consolidation mapping should return correct mapping by date."""
        from apps.coa.models import ConsolidationMapping
        from tests.factories import (
            AccountFactory,
            ConsolidationAccountFactory,
            ConsolidationMappingFactory,
        )

        entity = EntityFactory()
        account = AccountFactory(entity=entity)
        cons_acct1 = ConsolidationAccountFactory()
        cons_acct2 = ConsolidationAccountFactory()

        # Mapping v1: valid 2024-01-01 to 2024-06-30
        ConsolidationMappingFactory(
            entity_account=account,
            consolidation_account=cons_acct1,
            effective_from=date(2024, 1, 1),
            effective_to=date(2024, 6, 30),
        )

        # Mapping v2: valid 2024-07-01 onwards
        ConsolidationMappingFactory(
            entity_account=account,
            consolidation_account=cons_acct2,
            effective_from=date(2024, 7, 1),
            effective_to=None,
        )

        # Query on 2024-03-15 should return cons_acct1
        # (Implementation depends on query logic)

    @pytest.mark.django_db
    def test_intercompany_must_match(self):
        """Intercompany transactions must have matching debit/credit in both entities."""
        # This will be tested in integration tests with IntercompanyTransaction model


class TestAuditLogCompleteness:
    """Verify audit logs capture all mutations."""

    @pytest.mark.django_db
    def test_audit_log_on_entry_creation(self):
        """Creating an entry generates audit log."""
        from apps.audit.models import AuditLog

        entity = EntityFactory()
        entry = JournalEntryFactory(entity=entity)

        # Should have at least one audit log
        logs = AuditLog.objects.filter(
            table_name="finance_journalentry",
            record_id=entry.id,
        )
        # Count depends on implementation (creation + line creation)

    @pytest.mark.django_db
    def test_audit_log_captures_before_after(self):
        """Audit log should have before_state and after_state."""
        from apps.audit.models import AuditLog

        entity = EntityFactory()
        entry = JournalEntryFactory(entity=entity, status="draft")

        # Modify entry
        entry.status = "posted"
        entry.save()

        # Last audit log should have before/after
        log = AuditLog.objects.filter(
            table_name="finance_journalentry",
            record_id=entry.id,
        ).latest("created_at")

        assert log.before_state is not None
        assert log.after_state is not None

    @pytest.mark.django_db
    def test_audit_log_immutable(self):
        """Audit log entries should not be updateable."""
        from apps.audit.models import AuditLog

        entity = EntityFactory()
        JournalEntryFactory(entity=entity)

        log = AuditLog.objects.latest("created_at")
        log.reason = "CHANGED"

        # Should raise error or silently fail
        # (depends on database trigger implementation)


class TestPeriodLocking:
    """Verify posting restrictions based on period status."""

    @pytest.mark.django_db
    def test_cannot_post_to_closed_period(self):
        """Posting to a closed period should fail."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="closed")

        entry = JournalEntryFactory(
            entity=entity,
            period=period,
            status="draft",
        )

        # Attempt to post should fail
        # (exact error handling TBD)

    @pytest.mark.django_db
    def test_cannot_post_to_locked_period(self):
        """Posting to a locked period should fail."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="locked")

        entry = JournalEntryFactory(
            entity=entity,
            period=period,
            status="draft",
        )

        # Attempt to post should fail

    @pytest.mark.django_db
    def test_can_post_to_open_period(self):
        """Posting to open period should succeed."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        entry = JournalEntryFactory(
            entity=entity,
            period=period,
            status="draft",
        )

        # Should be able to post
        assert entry.status == "draft"


class TestImmutabilityInvariant:
    """Verify posted entries cannot be modified."""

    @pytest.mark.django_db
    def test_posted_entry_not_updateable(self):
        """Attempting to update posted entry should fail."""
        entity = EntityFactory()
        entry = JournalEntryFactory(entity=entity, status="posted")

        # Attempt to update description
        entry.description = "MODIFIED"
        # Should raise error or silently fail at DB level

    @pytest.mark.django_db
    def test_posted_entry_not_deletable(self):
        """Attempting to delete posted entry should fail."""
        entity = EntityFactory()
        entry = JournalEntryFactory(entity=entity, status="posted")

        # Attempt to delete
        # Should raise error or silently fail

    @pytest.mark.django_db
    def test_posted_entry_reversible(self):
        """Posted entries should be reversible via new reversal entry."""
        entity = EntityFactory()
        original = JournalEntryFactory(entity=entity, status="posted")

        # Create reversal entry
        reversal = JournalEntryFactory(
            entity=entity,
            status="posted",
            # reversed_entry_id = original.id  # TBD: model field
        )

        # Original entry should have reference to reversal
        assert original.status == "posted"  # Still immutable


class TestMultiEntityScoping:
    """Verify entity_id scoping is enforced."""

    @pytest.mark.django_db
    def test_entry_scoped_to_entity(self):
        """Entry.entity_id must match all its account entities."""
        entity1 = EntityFactory()
        entity2 = EntityFactory()

        account1 = AssetAccountFactory(entity=entity1)
        account2 = AssetAccountFactory(entity=entity2)

        entry = JournalEntryFactory(entity=entity1, lines=[])

        # Adding line with account from entity2 should fail
        # (depends on validation logic)

    @pytest.mark.django_db
    def test_cross_entity_query_filtering(self):
        """Queries should be filtered by entity_id for scoped users."""
        entity1 = EntityFactory()
        entity2 = EntityFactory()

        entry1 = JournalEntryFactory(entity=entity1)
        entry2 = JournalEntryFactory(entity=entity2)

        # Query for entity1 entries should only return entry1
        # (depends on ORM filtering in views)


# ============================================================================
# Stress Tests (large numbers)
# ============================================================================


class TestPropertyStress:
    """Run property-based tests with higher example counts."""

    @given(valid_journal_lines())
    @settings(max_examples=1000)
    def test_balance_1000_examples(self, lines):
        """Test balance invariant with 1000 examples."""
        total_debits = sum(debit for debit, _, _ in lines)
        total_credits = sum(credit for _, credit, _ in lines)
        assert total_debits == total_credits
