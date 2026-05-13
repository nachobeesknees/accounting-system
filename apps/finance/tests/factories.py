"""
Test data factories for financial models.

Provides realistic, reproducible test fixtures for journal entries,
GL transactions, multi-currency scenarios, and complex entity hierarchies.

All factories respect CLAUDE.md invariants:
- Money is always Decimal with explicit currency
- Double-entry balance is maintained
- Immutability rules are honored
- Entity scoping is enforced
"""

import decimal
from datetime import date, datetime, timedelta
from typing import Optional
from uuid import uuid4

import factory
from django.contrib.auth.models import User
from django.utils import timezone

from apps.core.models import Entity, EntityOwnership, Period, User as CoreUser
from apps.coa.models import Account, ConsolidationAccount, ConsolidationMapping, Dimension
from apps.fx.models import FXRate
from apps.finance.models import JournalEntry, JournalLine


class UserFactory(factory.django.DjangoModelFactory):
    """Factory for creating test users with consistent attributes."""

    class Meta:
        model = CoreUser

    username = factory.Sequence(lambda n: f"user_{n}")
    email = factory.Sequence(lambda n: f"user_{n}@test.local")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    is_active = True


class EntityFactory(factory.django.DjangoModelFactory):
    """
    Factory for creating test entities.

    Respects jurisdiction constraints and functional currency rules.
    """

    class Meta:
        model = Entity

    legal_name = factory.Faker("company")
    dba_name = factory.Faker("catch_phrase")
    tax_id = factory.Sequence(lambda n: f"EIN{n:09d}")
    entity_type = "opco"
    jurisdiction_country = "US"
    jurisdiction_state = "CA"
    fiscal_year_end_month = 12
    fiscal_year_end_day = 31
    functional_currency = "USD"
    accounting_basis = "accrual"
    active = True
    inception_date = date(2010, 1, 1)
    created_by = factory.SubFactory(UserFactory)
    updated_by = factory.SubFactory(UserFactory)

    @factory.post_generation
    def basis_features(obj, create, extracted, **kwargs):
        """Allow overriding basis features during creation."""
        if not create:
            return
        if extracted:
            obj.basis_features = extracted
        else:
            obj.basis_features = {}
        obj.save()


class MultiCurrencyEntityFactory(EntityFactory):
    """Factory for creating entities with non-USD functional currency."""

    functional_currency = factory.Iterator(["EUR", "GBP", "JPY", "CAD", "AUD"])
    jurisdiction_country = factory.Iterator(["US", "US", "US", "US", "US"])


class EntityOwnershipFactory(factory.django.DjangoModelFactory):
    """Factory for creating ownership relationships."""

    class Meta:
        model = EntityOwnership

    parent_entity = factory.SubFactory(EntityFactory)
    child_entity = factory.SubFactory(EntityFactory)
    ownership_percent = decimal.Decimal("100.000000")
    effective_from = date(2010, 1, 1)
    effective_to = None


class PeriodFactory(factory.django.DjangoModelFactory):
    """Factory for creating accounting periods."""

    class Meta:
        model = Period

    entity = factory.SubFactory(EntityFactory)
    period_type = "month"
    fiscal_year = 2024
    period_number = factory.Sequence(lambda n: (n % 12) + 1)
    period_start = factory.LazyAttribute(
        lambda o: date(2024, o.period_number, 1)
    )
    period_end = factory.LazyAttribute(
        lambda o: (
            date(2024, o.period_number, 28)
            if o.period_number in [2]
            else date(2024, o.period_number, 30)
            if o.period_number in [4, 6, 9, 11]
            else date(2024, o.period_number, 31)
        )
    )
    status = "open"
    created_by = factory.SubFactory(UserFactory)
    updated_by = factory.SubFactory(UserFactory)

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        """Ensure period dates are valid."""
        # Ensure period_end is not before period_start
        period_start = kwargs.get("period_start")
        period_end = kwargs.get("period_end")
        if period_start and period_end and period_end < period_start:
            kwargs["period_end"] = period_start + timedelta(days=28)
        return super()._create(model_class, *args, **kwargs)


class QuarterlyPeriodFactory(PeriodFactory):
    """Factory for creating quarterly periods."""

    period_type = "quarter"
    period_number = factory.Sequence(lambda n: ((n % 4) + 1))
    period_start = factory.LazyAttribute(
        lambda o: date(2024, (o.period_number - 1) * 3 + 1, 1)
    )
    period_end = factory.LazyAttribute(
        lambda o: date(2024, o.period_number * 3, 31) if o.period_number == 4
        else date(2024, o.period_number * 3, 30)
    )


class AccountFactory(factory.django.DjangoModelFactory):
    """Factory for creating chart of accounts entries."""

    class Meta:
        model = Account

    entity = factory.SubFactory(EntityFactory)
    code = factory.Sequence(lambda n: f"{1010 + n}")
    name = factory.Faker("word")
    account_type = "asset"
    normal_balance = "debit"
    is_postable = True
    is_active = True
    currency_restriction = None
    created_by = factory.SubFactory(UserFactory)
    updated_by = factory.SubFactory(UserFactory)


class AssetAccountFactory(AccountFactory):
    """Factory for asset accounts."""

    account_type = "asset"
    normal_balance = "debit"
    code = factory.Sequence(lambda n: f"{1000 + n}")


class LiabilityAccountFactory(AccountFactory):
    """Factory for liability accounts."""

    account_type = "liability"
    normal_balance = "credit"
    code = factory.Sequence(lambda n: f"{2000 + n}")


class EquityAccountFactory(AccountFactory):
    """Factory for equity accounts."""

    account_type = "equity"
    normal_balance = "credit"
    code = factory.Sequence(lambda n: f"{3000 + n}")


class RevenueAccountFactory(AccountFactory):
    """Factory for revenue accounts."""

    account_type = "revenue"
    normal_balance = "credit"
    code = factory.Sequence(lambda n: f"{4000 + n}")


class ExpenseAccountFactory(AccountFactory):
    """Factory for expense accounts."""

    account_type = "expense"
    normal_balance = "debit"
    code = factory.Sequence(lambda n: f"{5000 + n}")


class MultiCurrencyAccountFactory(AccountFactory):
    """Factory for accounts restricted to specific currency."""

    currency_restriction = factory.Iterator(["USD", "EUR", "GBP", "JPY"])


class ConsolidationAccountFactory(factory.django.DjangoModelFactory):
    """Factory for group-level chart of accounts."""

    class Meta:
        model = ConsolidationAccount

    code = factory.Sequence(lambda n: f"C{1010 + n}")
    name = factory.Faker("word")
    account_type = factory.Iterator(["asset", "liability", "equity", "revenue", "expense"])
    display_order = factory.Sequence(lambda n: n)


class ConsolidationMappingFactory(factory.django.DjangoModelFactory):
    """Factory for mapping entity accounts to consolidation accounts."""

    class Meta:
        model = ConsolidationMapping

    entity_account = factory.SubFactory(AccountFactory)
    consolidation_account = factory.SubFactory(ConsolidationAccountFactory)
    effective_from = date(2024, 1, 1)
    effective_to = None


class FXRateFactory(factory.django.DjangoModelFactory):
    """Factory for creating FX rates with realistic precision."""

    class Meta:
        model = FXRate

    from_currency = "USD"
    to_currency = "EUR"
    rate = decimal.Decimal("0.92150000")  # numeric(18, 8)
    effective_date = date.today()
    source = "test"
    rate_type = "spot"


class FXRatePairFactory:
    """
    Creates bidirectional FX rate pairs.

    Ensures inverse rates maintain consistency and precision.
    """

    _rates = {
        ("USD", "EUR"): decimal.Decimal("0.92150000"),
        ("USD", "GBP"): decimal.Decimal("0.79100000"),
        ("USD", "JPY"): decimal.Decimal("149.50000000"),
        ("EUR", "GBP"): decimal.Decimal("0.85850000"),
        ("GBP", "JPY"): decimal.Decimal("189.00000000"),
    }

    @classmethod
    def create_pair(
        cls,
        from_ccy: str,
        to_ccy: str,
        rate: Optional[decimal.Decimal] = None,
        effective_date: Optional[date] = None,
    ) -> tuple:
        """Create bidirectional FX rate pair."""
        if rate is None:
            rate = cls._rates.get((from_ccy, to_ccy), decimal.Decimal("1.00000000"))

        if effective_date is None:
            effective_date = date.today()

        forward = FXRateFactory(
            from_currency=from_ccy,
            to_currency=to_ccy,
            rate=rate,
            effective_date=effective_date,
        )

        # Create inverse rate
        if rate != 0:
            inverse_rate = (
                decimal.Decimal(1) / rate
            ).quantize(decimal.Decimal("0.00000001"), rounding=decimal.ROUND_HALF_EVEN)
        else:
            inverse_rate = decimal.Decimal("0.00000000")

        backward = FXRateFactory(
            from_currency=to_ccy,
            to_currency=from_ccy,
            rate=inverse_rate,
            effective_date=effective_date,
        )

        return forward, backward


class DimensionFactory(factory.django.DjangoModelFactory):
    """Factory for creating dimension types (department, project, etc)."""

    class Meta:
        model = Dimension

    entity = factory.SubFactory(EntityFactory)
    dimension_type = factory.Iterator(["department", "class", "location", "project"])
    code = factory.Sequence(lambda n: f"D{n:04d}")
    name = factory.Faker("word")
    is_active = True
    created_by = factory.SubFactory(UserFactory)
    updated_by = factory.SubFactory(UserFactory)


class JournalEntryFactory(factory.django.DjangoModelFactory):
    """
    Factory for creating balanced journal entries.

    Ensures double-entry balance invariant is maintained.
    """

    class Meta:
        model = JournalEntry

    entity = factory.SubFactory(EntityFactory)
    journal_code = factory.Sequence(lambda n: f"GJ{n:06d}")
    description = factory.Faker("sentence")
    entry_date = date.today()
    period = factory.SubFactory(PeriodFactory)
    entry_currency = "USD"
    status = "draft"
    created_by = factory.SubFactory(UserFactory)
    posted_by = None
    posted_at = None
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
    updated_by = factory.SubFactory(UserFactory)

    @factory.post_generation
    def lines(obj, create, extracted, **kwargs):
        """
        Generate balanced journal lines by default.

        Can be overridden by passing lines=[...] to the factory.
        """
        if not create:
            return

        if extracted:
            # Use provided lines
            for line in extracted:
                line.journal_entry = obj
                line.save()
        else:
            # Create default balanced entry: $1000 debit to asset, credit to liability
            asset_account = AssetAccountFactory(entity=obj.entity)
            liability_account = LiabilityAccountFactory(entity=obj.entity)

            JournalLineFactory(
                journal_entry=obj,
                account=asset_account,
                debit=decimal.Decimal("1000.0000"),
                credit=decimal.Decimal("0.0000"),
            )
            JournalLineFactory(
                journal_entry=obj,
                account=liability_account,
                debit=decimal.Decimal("0.0000"),
                credit=decimal.Decimal("1000.0000"),
            )


class JournalLineFactory(factory.django.DjangoModelFactory):
    """Factory for individual journal entry lines."""

    class Meta:
        model = JournalLine

    journal_entry = factory.SubFactory(JournalEntryFactory)
    account = factory.SubFactory(AssetAccountFactory)
    debit = decimal.Decimal("0.0000")
    credit = decimal.Decimal("0.0000")
    description = factory.Faker("sentence")
    line_number = factory.Sequence(lambda n: n + 1)
    created_by = factory.SubFactory(UserFactory)
    updated_by = factory.SubFactory(UserFactory)


class BalancedJournalEntryFactory(JournalEntryFactory):
    """
    Factory for creating pre-balanced multi-line entries.

    Useful for testing without manual line creation.
    """

    @factory.post_generation
    def lines(obj, create, extracted, **kwargs):
        """Create a 3-line balanced entry by default."""
        if not create or extracted:
            return

        # Create 3 accounts and a balanced entry
        checking = AssetAccountFactory(entity=obj.entity, code="1010")
        accounts_payable = LiabilityAccountFactory(entity=obj.entity, code="2010")
        revenue = RevenueAccountFactory(entity=obj.entity, code="4000")

        # Debit Checking $1000
        JournalLineFactory(
            journal_entry=obj,
            account=checking,
            debit=decimal.Decimal("1000.0000"),
            credit=decimal.Decimal("0.0000"),
            line_number=1,
        )
        # Credit AP $700
        JournalLineFactory(
            journal_entry=obj,
            account=accounts_payable,
            debit=decimal.Decimal("0.0000"),
            credit=decimal.Decimal("700.0000"),
            line_number=2,
        )
        # Credit Revenue $300
        JournalLineFactory(
            journal_entry=obj,
            account=revenue,
            debit=decimal.Decimal("0.0000"),
            credit=decimal.Decimal("300.0000"),
            line_number=3,
        )


class MultiCurrencyJournalEntryFactory(JournalEntryFactory):
    """Factory for multi-currency transactions."""

    entry_currency = factory.Iterator(["USD", "EUR", "GBP", "JPY"])

    @factory.post_generation
    def lines(obj, create, extracted, **kwargs):
        """Create balanced entry in the specified currency."""
        if not create:
            return

        if extracted:
            for line in extracted:
                line.journal_entry = obj
                line.save()
        else:
            # Create accounts if not in same currency
            asset = AssetAccountFactory(
                entity=obj.entity, currency_restriction=obj.entry_currency
            )
            liability = LiabilityAccountFactory(
                entity=obj.entity, currency_restriction=obj.entry_currency
            )

            JournalLineFactory(
                journal_entry=obj,
                account=asset,
                debit=decimal.Decimal("500.0000"),
                credit=decimal.Decimal("0.0000"),
            )
            JournalLineFactory(
                journal_entry=obj,
                account=liability,
                debit=decimal.Decimal("0.0000"),
                credit=decimal.Decimal("500.0000"),
            )


class ComplexEntityHierarchyFactory:
    """Factory for creating realistic multi-tier ownership structures."""

    @staticmethod
    def create_pyramid(depth: int = 3, width: int = 2) -> dict:
        """
        Create a pyramid ownership structure.

        Args:
            depth: Number of tiers (root to leaf)
            width: Children per parent

        Returns:
            Dict mapping tier -> [entities]
        """
        hierarchy = {}

        # Tier 0: holding company
        root = EntityFactory(entity_type="holdco", legal_name="Root Holdco")
        hierarchy[0] = [root]

        # Tiers 1 to depth-1
        for tier in range(1, depth):
            hierarchy[tier] = []
            for parent in hierarchy[tier - 1]:
                for _ in range(width):
                    child = EntityFactory(
                        entity_type="holdco" if tier < depth - 1 else "opco"
                    )
                    EntityOwnershipFactory(
                        parent_entity=parent,
                        child_entity=child,
                        ownership_percent=decimal.Decimal("100.000000"),
                    )
                    hierarchy[tier].append(child)

        return hierarchy

    @staticmethod
    def create_diamond() -> dict:
        """Create a diamond-shaped ownership: root -> 2 middlemen -> leaf."""
        root = EntityFactory(entity_type="holdco", legal_name="Root Holdco")
        middle1 = EntityFactory(entity_type="holdco", legal_name="Middle 1")
        middle2 = EntityFactory(entity_type="holdco", legal_name="Middle 2")
        leaf = EntityFactory(entity_type="opco", legal_name="Leaf Opco")

        EntityOwnershipFactory(
            parent_entity=root,
            child_entity=middle1,
            ownership_percent=decimal.Decimal("50.000000"),
        )
        EntityOwnershipFactory(
            parent_entity=root,
            child_entity=middle2,
            ownership_percent=decimal.Decimal("50.000000"),
        )
        EntityOwnershipFactory(
            parent_entity=middle1,
            child_entity=leaf,
            ownership_percent=decimal.Decimal("50.000000"),
        )
        EntityOwnershipFactory(
            parent_entity=middle2,
            child_entity=leaf,
            ownership_percent=decimal.Decimal("50.000000"),
        )

        return {
            "root": root,
            "middle1": middle1,
            "middle2": middle2,
            "leaf": leaf,
        }


class LargeDatasetFactory:
    """Factory for creating realistic large-scale test data."""

    @staticmethod
    def create_gl_entries(
        entity: Entity,
        num_entries: int = 1000,
        num_lines_per_entry: int = 3,
    ) -> list:
        """
        Create a large batch of GL entries.

        Args:
            entity: Entity to post entries to
            num_entries: Number of journal entries to create
            num_lines_per_entry: Average lines per entry

        Returns:
            List of created JournalEntry objects
        """
        entries = []
        for i in range(num_entries):
            entry = BalancedJournalEntryFactory(entity=entity)
            entries.append(entry)
            if i % 100 == 0:
                # Log progress
                pass
        return entries

    @staticmethod
    def create_24month_sample(entity: Entity) -> list:
        """Create a 24-month sample of realistic GL transactions."""
        entries = []
        base_date = date(2023, 1, 1)

        # ~100 entries per month
        for month_offset in range(24):
            month_date = base_date + timedelta(days=30 * month_offset)
            for day in range(1, 10):  # ~10 entries per month
                entry = BalancedJournalEntryFactory(
                    entity=entity,
                    entry_date=month_date + timedelta(days=day),
                )
                entries.append(entry)

        return entries
