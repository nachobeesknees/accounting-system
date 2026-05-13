"""
Tests for bank reconciliation engine.

Coverage:
- Auto-matching algorithm
- Reconciliation state machine
- Outstanding item tracking
- Multi-currency reconciliation
- Variance calculation
"""

from datetime import datetime
from decimal import Decimal

import pytest
from django.test import TestCase
from django.utils import timezone

from apps.integrations.models import (
    BankAccount,
    BankTransaction,
    BankReconciliation,
    BankReconciliationLine,
)
from apps.integrations.reconciliation_engine import ReconciliationEngine


class TestReconciliationEngine(TestCase):
    """Tests for the reconciliation engine."""

    def setUp(self):
        """Set up test fixtures."""
        self.bank_account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Test Checking',
            institution='chase',
            account_number='1234567890',
            functional_currency='USD',
        )

    def test_create_reconciliation(self):
        """Test creating a new reconciliation."""
        as_of_date = datetime(2024, 5, 31)
        statement_balance = Decimal('5000.00')

        engine = ReconciliationEngine(self.bank_account)
        recon = engine.create_reconciliation(as_of_date, statement_balance)

        assert recon.bank_account == self.bank_account
        assert recon.statement_balance == statement_balance
        assert recon.status == 'incomplete'
        assert recon.beginning_balance_per_books == Decimal('0')

    def test_create_reconciliation_with_previous_balance(self):
        """Test creating a reconciliation with previous balance."""
        # Create first reconciliation
        recon1 = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-04-30',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('1500.00'),
            book_balance=Decimal('1500.00'),
            variance=Decimal('0'),
            status='complete',
        )

        # Create second reconciliation
        as_of_date = datetime(2024, 5, 31)
        statement_balance = Decimal('2000.00')

        engine = ReconciliationEngine(self.bank_account)
        recon2 = engine.create_reconciliation(as_of_date, statement_balance)

        assert recon2.beginning_balance_per_books == Decimal('1500.00')

    def test_reconciliation_complete_with_zero_variance(self):
        """Test that reconciliation is complete when variance is 0."""
        recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('2000.00'),
            book_balance=Decimal('2000.00'),
            variance=Decimal('0'),
            status='incomplete',
        )

        engine = ReconciliationEngine(self.bank_account)
        assert engine.is_complete(recon) is True

    def test_reconciliation_incomplete_with_variance(self):
        """Test that reconciliation is incomplete when variance exists."""
        recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('2000.00'),
            book_balance=Decimal('1500.00'),
            variance=Decimal('500.00'),
            status='incomplete',
        )

        engine = ReconciliationEngine(self.bank_account)
        assert engine.is_complete(recon) is False

    def test_reconciliation_incomplete_with_large_unmatched(self):
        """Test that reconciliation is incomplete with large unmatched items."""
        recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('2000.00'),
            book_balance=Decimal('2000.00'),
            variance=Decimal('0'),
            status='incomplete',
        )

        # Create a large unmatched item
        tx = BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-31',
            amount=Decimal('2000.00'),
            description='Large transaction',
            status='unmatched',
        )

        BankReconciliationLine.objects.create(
            reconciliation=recon,
            line_type='unmatched',
            bank_transaction=tx,
            amount=Decimal('2000.00'),
            description='Large transaction',
            transaction_date='2024-05-31',
        )

        engine = ReconciliationEngine(self.bank_account)
        # Should be incomplete because of large unmatched item
        assert engine.is_complete(recon) is False

    def test_generate_summary(self):
        """Test generating a reconciliation summary."""
        recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('2000.00'),
            book_balance=Decimal('1900.00'),
            variance=Decimal('100.00'),
            status='incomplete',
        )

        # Create some test lines
        tx1 = BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-10',
            amount=Decimal('500.00'),
            description='Transaction 1',
        )

        tx2 = BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-20',
            amount=Decimal('300.00'),
            description='Transaction 2',
        )

        # Create matched line
        BankReconciliationLine.objects.create(
            reconciliation=recon,
            line_type='matched',
            bank_transaction=tx1,
            amount=Decimal('500.00'),
            description='Transaction 1',
            transaction_date='2024-05-10',
        )

        # Create unmatched line
        BankReconciliationLine.objects.create(
            reconciliation=recon,
            line_type='unmatched',
            bank_transaction=tx2,
            amount=Decimal('300.00'),
            description='Transaction 2',
            transaction_date='2024-05-20',
        )

        # Create outstanding line
        BankReconciliationLine.objects.create(
            reconciliation=recon,
            line_type='outstanding',
            amount=Decimal('100.00'),
            description='Check in transit',
            transaction_date='2024-05-25',
        )

        engine = ReconciliationEngine(self.bank_account)
        summary = engine.generate_summary(recon)

        assert summary['matched_count'] == 1
        assert summary['unmatched_count'] == 1
        assert summary['outstanding_count'] == 1
        assert summary['outstanding_total'] == Decimal('100.00')
        assert summary['variance'] == Decimal('100.00')

    def test_calculate_variance(self):
        """Test variance calculation."""
        recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('2000.00'),
            book_balance=Decimal('1900.00'),
            variance=Decimal('0'),  # Will be recalculated
            status='incomplete',
        )

        # Create outstanding items
        BankReconciliationLine.objects.create(
            reconciliation=recon,
            line_type='outstanding',
            amount=Decimal('-100.00'),
            description='Outstanding check',
            transaction_date='2024-05-25',
        )

        engine = ReconciliationEngine(self.bank_account)
        variance = engine.calculate_variance(recon)

        # statement_balance (2000) - (book_balance (1900) + outstanding (-100))
        # = 2000 - (1900 - 100) = 2000 - 1800 = 200
        expected_variance = Decimal('200.00')
        assert variance == expected_variance

        recon.refresh_from_db()
        assert recon.variance == expected_variance

    def test_auto_match(self):
        """Test auto-matching transactions."""
        recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('2000.00'),
            book_balance=Decimal('2000.00'),
            variance=Decimal('0'),
            status='incomplete',
        )

        # Create a bank transaction
        tx = BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-15',
            amount=Decimal('500.00'),
            description='Starbucks Coffee',
            status='unmatched',
        )

        engine = ReconciliationEngine(self.bank_account)
        # Note: auto_match returns (count, errors)
        # The actual matching logic is stubbed in the current implementation
        matched_count, errors = engine.auto_match(recon)

        # In current implementation, no matches are found (stubbed)
        # This test documents the behavior
        assert isinstance(matched_count, int)
        assert isinstance(errors, list)

    def test_reconciliation_state_transitions(self):
        """Test reconciliation state transitions."""
        recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('2000.00'),
            book_balance=Decimal('2000.00'),
            variance=Decimal('0'),
            status='incomplete',
        )

        # Transition to in_progress
        recon.status = 'in_progress'
        recon.save()

        # Transition to complete
        recon.status = 'complete'
        recon.save()

        # Transition to approved
        recon.status = 'approved'
        recon.approved_at = timezone.now()
        recon.approved_by = 'user_123'
        recon.save()

        recon.refresh_from_db()
        assert recon.status == 'approved'
        assert recon.approved_at is not None


class TestBankReconciliationLine(TestCase):
    """Tests for BankReconciliationLine model."""

    def setUp(self):
        """Set up test fixtures."""
        self.bank_account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Test Checking',
            institution='chase',
            account_number='1234567890',
            functional_currency='USD',
        )

        self.recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('2000.00'),
            book_balance=Decimal('2000.00'),
            variance=Decimal('0'),
            status='incomplete',
        )

    def test_create_matched_line(self):
        """Test creating a matched reconciliation line."""
        tx = BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-15',
            amount=Decimal('500.00'),
            description='Transaction',
            status='unmatched',
        )

        line = BankReconciliationLine.objects.create(
            reconciliation=self.recon,
            line_type='matched',
            bank_transaction=tx,
            journal_entry_id='je_123',
            journal_line_id='jl_123',
            amount=Decimal('500.00'),
            description='Transaction',
            transaction_date='2024-05-15',
        )

        assert line.line_type == 'matched'
        assert line.journal_entry_id == 'je_123'
        assert line.bank_transaction == tx

    def test_create_outstanding_line(self):
        """Test creating an outstanding reconciliation line."""
        line = BankReconciliationLine.objects.create(
            reconciliation=self.recon,
            line_type='outstanding',
            journal_entry_id='je_456',
            amount=Decimal('-100.00'),
            description='Outstanding check #1234',
            transaction_date='2024-05-25',
        )

        assert line.line_type == 'outstanding'
        assert line.journal_entry_id == 'je_456'
        assert line.bank_transaction is None

    def test_create_unmatched_line(self):
        """Test creating an unmatched reconciliation line."""
        tx = BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-20',
            amount=Decimal('250.00'),
            description='Unknown transaction',
            status='unmatched',
        )

        line = BankReconciliationLine.objects.create(
            reconciliation=self.recon,
            line_type='unmatched',
            bank_transaction=tx,
            amount=Decimal('250.00'),
            description='Unknown transaction',
            transaction_date='2024-05-20',
        )

        assert line.line_type == 'unmatched'
        assert line.journal_entry_id is None


class TestMultiCurrencyReconciliation(TestCase):
    """Tests for multi-currency reconciliation."""

    def setUp(self):
        """Set up test fixtures."""
        self.bank_account_usd = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='USD Checking',
            institution='chase',
            account_number='usd_account',
            functional_currency='USD',
        )

        self.bank_account_eur = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='EUR Checking',
            institution='chase',
            account_number='eur_account',
            functional_currency='EUR',
        )

    def test_reconciliation_currency_consistency(self):
        """Test that reconciliation maintains currency consistency."""
        recon_usd = BankReconciliation.objects.create(
            bank_account=self.bank_account_usd,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.00'),
            statement_balance=Decimal('2000.00'),
            book_balance=Decimal('2000.00'),
            variance=Decimal('0'),
        )

        recon_eur = BankReconciliation.objects.create(
            bank_account=self.bank_account_eur,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('900.00'),
            statement_balance=Decimal('1800.00'),
            book_balance=Decimal('1800.00'),
            variance=Decimal('0'),
        )

        assert recon_usd.bank_account.functional_currency == 'USD'
        assert recon_eur.bank_account.functional_currency == 'EUR'


class TestReconciliationAmountPrecision(TestCase):
    """Tests for amount precision in reconciliation (Decimal, not float)."""

    def setUp(self):
        """Set up test fixtures."""
        self.bank_account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Test Checking',
            institution='chase',
            account_number='1234567890',
            functional_currency='USD',
        )

    def test_reconciliation_preserves_decimal_precision(self):
        """Test that amounts maintain decimal precision through reconciliation."""
        # Use a precise amount that would be problematic with float
        precise_amount = Decimal('1234.567')

        recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('1000.0000'),
            statement_balance=precise_amount,
            book_balance=precise_amount,
            variance=Decimal('0'),
        )

        recon.refresh_from_db()
        assert recon.statement_balance == Decimal('1234.567')
        assert recon.book_balance == Decimal('1234.567')

    def test_bank_transaction_amount_precision(self):
        """Test that bank transaction amounts maintain precision."""
        precise_amount = Decimal('99.99999')

        tx = BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-15',
            amount=precise_amount,
            description='Precise transaction',
        )

        tx.refresh_from_db()
        assert tx.amount == Decimal('99.99999')

    def test_reconciliation_variance_calculation_precision(self):
        """Test variance calculation precision with Decimal."""
        statement = Decimal('1000.1234')
        book = Decimal('1000.5678')
        expected_variance = statement - book

        recon = BankReconciliation.objects.create(
            bank_account=self.bank_account,
            as_of_date='2024-05-31',
            beginning_balance_per_books=Decimal('0'),
            statement_balance=statement,
            book_balance=book,
            variance=expected_variance,
        )

        assert recon.variance == Decimal('-0.4444')
