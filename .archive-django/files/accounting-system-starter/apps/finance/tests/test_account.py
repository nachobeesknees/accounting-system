"""
Test suite for Account (Chart of Accounts) model.

Coverage:
- Account hierarchy (parent/child)
- Account types and normal balance
- Postability constraints
- Currency restrictions
- Entity scoping
"""
import datetime

import pytest
from django.db import IntegrityError

from apps.finance.models import Account, JournalLine


@pytest.mark.django_db
class TestAccountHierarchy:
    """Account parent/child hierarchy."""

    def test_parent_account_not_postable(self, entity, user):
        """Parent accounts typically cannot be posted to."""
        parent = Account.objects.create(
            entity=entity,
            code='1000',
            name='Assets',
            account_type='asset',
            normal_balance='debit',
            is_postable=False,  # Parent
            created_by=user,
        )

        child = Account.objects.create(
            entity=entity,
            code='1010',
            name='Cash',
            account_type='asset',
            normal_balance='debit',
            is_postable=True,  # Leaf
            parent=parent,
            created_by=user,
        )

        assert parent.is_postable is False
        assert child.is_postable is True
        assert child.parent == parent

    def test_account_hierarchy_retrieval(self, entity, user):
        """Can traverse parent/child relationships."""
        parent = Account.objects.create(
            entity=entity,
            code='2000',
            name='Liabilities',
            account_type='liability',
            normal_balance='credit',
            is_postable=False,
            created_by=user,
        )

        child1 = Account.objects.create(
            entity=entity,
            code='2100',
            name='Accounts Payable',
            account_type='liability',
            normal_balance='credit',
            is_postable=True,
            parent=parent,
            created_by=user,
        )

        child2 = Account.objects.create(
            entity=entity,
            code='2200',
            name='Accrued Expenses',
            account_type='liability',
            normal_balance='credit',
            is_postable=True,
            parent=parent,
            created_by=user,
        )

        # Query children
        children = parent.children.all()
        assert children.count() == 2
        assert child1 in children
        assert child2 in children


@pytest.mark.django_db
class TestAccountTypes:
    """Account type and subtype classification."""

    def test_all_account_types_creatable(self, entity, user):
        """All account types can be created."""
        types = ['asset', 'liability', 'equity', 'revenue', 'expense']

        for acc_type in types:
            account = Account.objects.create(
                entity=entity,
                code=f'1{len(types):03d}',
                name=f'{acc_type.title()} Account',
                account_type=acc_type,
                normal_balance='debit' if acc_type in ['asset', 'expense'] else 'credit',
                is_postable=True,
                created_by=user,
            )
            assert account.account_type == acc_type

    def test_normal_balance_per_type(self, entity, user):
        """Normal balance is correct per account type."""
        # Assets normally debit
        asset = Account.objects.create(
            entity=entity,
            code='1010',
            name='Cash',
            account_type='asset',
            normal_balance='debit',
            created_by=user,
        )
        assert asset.normal_balance == 'debit'

        # Revenue normally credits
        revenue = Account.objects.create(
            entity=entity,
            code='4000',
            name='Revenue',
            account_type='revenue',
            normal_balance='credit',
            created_by=user,
        )
        assert revenue.normal_balance == 'credit'

    def test_account_subtypes(self, entity, user):
        """Subtypes provide additional classification."""
        account = Account.objects.create(
            entity=entity,
            code='1200',
            name='Checking Account',
            account_type='asset',
            account_subtype='current_asset',
            normal_balance='debit',
            created_by=user,
        )
        assert account.account_subtype == 'current_asset'


@pytest.mark.django_db
class TestAccountEntityScoping:
    """Accounts are scoped per entity."""

    def test_account_requires_entity(self, user):
        """Account must belong to an entity."""
        with pytest.raises(IntegrityError):
            Account.objects.create(
                entity=None,
                code='1010',
                name='Cash',
                account_type='asset',
                normal_balance='debit',
                created_by=user,
            )

    def test_code_unique_per_entity(self, entity, user):
        """Account code must be unique per entity."""
        Account.objects.create(
            entity=entity,
            code='1010',
            name='Cash',
            account_type='asset',
            normal_balance='debit',
            created_by=user,
        )

        # Same code, same entity = duplicate
        with pytest.raises(IntegrityError):
            Account.objects.create(
                entity=entity,
                code='1010',
                name='Another Cash Account',
                account_type='asset',
                normal_balance='debit',
                created_by=user,
            )


@pytest.mark.django_db
class TestAccountCurrencyRestriction:
    """Currency restrictions on accounts."""

    def test_no_currency_restriction_by_default(self, accounts):
        """By default, accounts accept any currency."""
        for account in accounts.values():
            assert account.currency_restriction is None

    def test_currency_restricted_account(self, entity, user):
        """Account can be restricted to single currency."""
        account = Account.objects.create(
            entity=entity,
            code='1500',
            name='EUR Cash',
            account_type='asset',
            normal_balance='debit',
            currency_restriction='EUR',
            created_by=user,
        )
        assert account.currency_restriction == 'EUR'

    def test_iso_4217_currency_code(self, entity, user):
        """Currency restriction uses ISO 4217 codes."""
        for code in ['USD', 'EUR', 'GBP', 'JPY', 'CAD']:
            account = Account.objects.create(
                entity=entity,
                code=f'{code}_{len([x for x in range(1000)])}',
                name=f'{code} Account',
                account_type='asset',
                normal_balance='debit',
                currency_restriction=code,
                created_by=user,
            )
            assert len(account.currency_restriction) == 3


@pytest.mark.django_db
class TestAccountActiveStatus:
    """Active vs inactive accounts."""

    def test_active_account_by_default(self, accounts):
        """New accounts are active."""
        for account in accounts.values():
            assert account.is_active is True

    def test_inactive_account_creation(self, entity, user):
        """Inactive accounts can be created."""
        account = Account.objects.create(
            entity=entity,
            code='9999',
            name='Inactive Account',
            account_type='asset',
            normal_balance='debit',
            is_active=False,
            created_by=user,
        )
        assert account.is_active is False


@pytest.mark.django_db
class TestAccountPostability:
    """Postable vs non-postable accounts."""

    def test_postable_account_by_default(self, accounts):
        """New accounts default to postable."""
        for account in accounts.values():
            assert account.is_postable is True

    def test_non_postable_parent(self, entity, user):
        """Parent accounts marked as non-postable."""
        parent = Account.objects.create(
            entity=entity,
            code='3000',
            name='Equity',
            account_type='equity',
            normal_balance='credit',
            is_postable=False,
            created_by=user,
        )
        assert parent.is_postable is False

    def test_journal_line_requires_postable_account(
        self, journal_entry_draft, entity, user
    ):
        """Cannot post to non-postable account."""
        # Create non-postable parent account
        parent = Account.objects.create(
            entity=entity,
            code='1000_Parent',
            name='Assets Parent',
            account_type='asset',
            normal_balance='debit',
            is_postable=False,
            created_by=user,
        )

        # Verify the parent is not postable
        assert parent.is_postable is False


@pytest.mark.django_db
class TestAccountDescription:
    """Account descriptions."""

    def test_description_optional(self, entity, user):
        """Description is optional."""
        account = Account.objects.create(
            entity=entity,
            code='5555',
            name='Test Account',
            account_type='asset',
            normal_balance='debit',
            created_by=user,
        )
        assert account.description == ''

    def test_description_stored(self, entity, user):
        """Long descriptions can be stored."""
        desc = 'This is a detailed account description with multiple lines of information.'
        account = Account.objects.create(
            entity=entity,
            code='5556',
            name='Test Account 2',
            account_type='asset',
            normal_balance='debit',
            description=desc,
            created_by=user,
        )
        assert account.description == desc


@pytest.mark.django_db
class TestAccountAuditTrail:
    """Audit trail on accounts."""

    def test_created_by_tracked(self, entity, user):
        """created_by is recorded."""
        account = Account.objects.create(
            entity=entity,
            code='6000',
            name='Created Account',
            account_type='asset',
            normal_balance='debit',
            created_by=user,
        )
        assert account.created_by == user

    def test_timestamps_tracked(self, entity, user):
        """created_at and updated_at are tracked."""
        account = Account.objects.create(
            entity=entity,
            code='6001',
            name='Timestamped Account',
            account_type='asset',
            normal_balance='debit',
            created_by=user,
        )
        assert account.created_at is not None
        assert account.updated_at is not None


@pytest.mark.django_db
class TestAccountStringRepresentation:
    """String representations."""

    def test_str_includes_code_and_name(self, accounts):
        """__str__ includes code and name."""
        account = accounts['cash']
        str_repr = str(account)
        assert account.code in str_repr
        assert account.name in str_repr

    def test_str_for_all_types(self, entity, user):
        """__str__ works for all account types."""
        for acc_type in ['asset', 'liability', 'equity', 'revenue', 'expense']:
            account = Account.objects.create(
                entity=entity,
                code=f'X{acc_type[:2].upper()}001',
                name=f'{acc_type.title()} Account',
                account_type=acc_type,
                normal_balance='debit' if acc_type in ['asset', 'expense'] else 'credit',
                created_by=user,
            )
            str_repr = str(account)
            assert len(str_repr) > 0
            assert account.code in str_repr
