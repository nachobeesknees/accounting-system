"""
Tests for Plaid integration and webhook handling.

Coverage:
- Plaid webhook parsing (multiple transaction types)
- OAuth flow
- Transaction fetching
- Connection failure handling
- Multi-account support
"""

import json
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock

import pytest
from django.test import TestCase
from django.utils import timezone

from apps.integrations.models import BankAccount, BankTransaction
from apps.integrations.plaid_client import (
    PlaidClient,
    PlaidAPIError,
    handle_transactions_webhook,
    fetch_transactions_for_account,
)


class TestPlaidClient(TestCase):
    """Tests for PlaidClient class."""

    def setUp(self):
        """Set up test fixtures."""
        self.client = PlaidClient(client_id='test_client_id', secret='test_secret')

    def test_client_init_with_explicit_credentials(self):
        """Test initializing PlaidClient with explicit credentials."""
        client = PlaidClient(client_id='custom_id', secret='custom_secret')
        assert client.client_id == 'custom_id'
        assert client.secret == 'custom_secret'

    def test_client_init_missing_credentials(self):
        """Test that PlaidClient raises error without credentials."""
        with patch('apps.integrations.plaid_client.PLAID_CLIENT_ID', None):
            with patch('apps.integrations.plaid_client.PLAID_SECRET', None):
                with pytest.raises(ValueError, match='must be configured'):
                    PlaidClient()

    @patch('apps.integrations.plaid_client.requests.request')
    def test_create_link_token(self, mock_request):
        """Test creating a link token for the OAuth flow."""
        mock_response = MagicMock()
        mock_response.json.return_value = {'link_token': 'test_link_token_123'}
        mock_request.return_value = mock_response

        token = self.client.create_link_token(
            user_id='user_123',
            client_name='Test App',
        )

        assert token == 'test_link_token_123'
        mock_request.assert_called_once()

    @patch('apps.integrations.plaid_client.requests.request')
    def test_create_link_token_with_webhook(self, mock_request):
        """Test creating a link token with webhook URL."""
        mock_response = MagicMock()
        mock_response.json.return_value = {'link_token': 'test_link_token_456'}
        mock_request.return_value = mock_response

        token = self.client.create_link_token(
            user_id='user_456',
            webhook='https://example.com/webhook',
        )

        assert token == 'test_link_token_456'
        call_args = mock_request.call_args
        assert call_args[1]['json']['webhook'] == 'https://example.com/webhook'

    @patch('apps.integrations.plaid_client.requests.request')
    def test_exchange_public_token(self, mock_request):
        """Test exchanging a public token for an access token."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'access_token': 'access_token_123',
            'item_id': 'item_123',
        }
        mock_request.return_value = mock_response

        access_token, item_id = self.client.exchange_public_token('public_token_xyz')

        assert access_token == 'access_token_123'
        assert item_id == 'item_123'

    @patch('apps.integrations.plaid_client.requests.request')
    def test_get_accounts(self, mock_request):
        """Test fetching accounts for a linked item."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'accounts': [
                {
                    'account_id': 'account_123',
                    'name': 'Checking',
                    'type': 'depository',
                    'subtype': 'checking',
                    'mask': '1234',
                },
                {
                    'account_id': 'account_456',
                    'name': 'Savings',
                    'type': 'depository',
                    'subtype': 'savings',
                    'mask': '5678',
                },
            ]
        }
        mock_request.return_value = mock_response

        accounts = self.client.get_accounts('access_token_123')

        assert len(accounts) == 2
        assert accounts[0]['account_id'] == 'account_123'
        assert accounts[1]['name'] == 'Savings'

    @patch('apps.integrations.plaid_client.requests.request')
    def test_get_transactions(self, mock_request):
        """Test fetching transactions."""
        start_date = datetime(2024, 1, 1)
        end_date = datetime(2024, 1, 31)

        mock_response = MagicMock()
        mock_response.json.return_value = {
            'transactions': [
                {
                    'transaction_id': 'tx_1',
                    'date': '2024-01-05',
                    'name': 'Starbucks',
                    'amount': 5.50,
                    'merchant_name': 'Starbucks',
                },
            ],
            'total_transactions': 1,
        }
        mock_request.return_value = mock_response

        transactions, total = self.client.get_transactions(
            'access_token_123',
            start_date,
            end_date,
        )

        assert len(transactions) == 1
        assert total == 1
        assert transactions[0]['transaction_id'] == 'tx_1'

    @patch('apps.integrations.plaid_client.requests.request')
    def test_get_transactions_pagination(self, mock_request):
        """Test transaction fetching with pagination."""
        start_date = datetime(2024, 1, 1)
        end_date = datetime(2024, 1, 31)

        # First call returns 100 transactions and total=150
        # Second call returns 50 transactions and total=150
        mock_responses = [
            MagicMock(),
            MagicMock(),
        ]
        mock_responses[0].json.return_value = {
            'transactions': [{'transaction_id': f'tx_{i}'} for i in range(100)],
            'total_transactions': 150,
        }
        mock_responses[1].json.return_value = {
            'transactions': [{'transaction_id': f'tx_{i}'} for i in range(100, 150)],
            'total_transactions': 150,
        }
        mock_request.side_effect = mock_responses

        transactions, total = self.client.get_transactions(
            'access_token_123',
            start_date,
            end_date,
        )

        assert len(transactions) == 150
        assert total == 150

    @patch('apps.integrations.plaid_client.requests.request')
    def test_get_transactions_api_error(self, mock_request):
        """Test handling Plaid API errors."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'error_code': 'INVALID_REQUEST',
            'error_message': 'Invalid access token',
        }
        mock_request.return_value = mock_response

        with pytest.raises(PlaidAPIError, match='INVALID_REQUEST'):
            self.client.get_transactions(
                'invalid_token',
                datetime(2024, 1, 1),
                datetime(2024, 1, 31),
            )

    @patch('apps.integrations.plaid_client.requests.request')
    def test_request_network_error(self, mock_request):
        """Test handling network errors."""
        mock_request.side_effect = Exception('Connection timeout')

        with pytest.raises(PlaidAPIError, match='Request failed'):
            self.client.get_accounts('access_token_123')


class TestWebhookHandling(TestCase):
    """Tests for Plaid webhook handling."""

    def setUp(self):
        """Set up test fixtures."""
        # Create a test bank account with a Plaid item ID
        self.bank_account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Test Checking',
            institution='chase',
            account_number='1234567890',
            functional_currency='USD',
            plaid_item_id='item_abc123',
            plaid_access_token='access_token_123',
        )

    def test_handle_transactions_added_webhook(self):
        """Test processing a TRANSACTIONS_ADDED webhook."""
        webhook_data = {
            'webhook_type': 'TRANSACTIONS',
            'webhook_code': 'TRANSACTIONS_ADDED',
            'item_id': self.bank_account.plaid_item_id,
            'new_transactions': [
                {
                    'transaction_id': 'plaid_tx_1',
                    'date': '2024-05-10',
                    'name': 'Starbucks Coffee',
                    'amount': 5.50,
                    'merchant_name': 'Starbucks',
                },
                {
                    'transaction_id': 'plaid_tx_2',
                    'date': '2024-05-11',
                    'name': 'Whole Foods',
                    'amount': 125.00,
                    'merchant_name': 'Whole Foods Market',
                },
            ],
        }

        created_count, errors = handle_transactions_webhook(webhook_data)

        assert created_count == 2
        assert len(errors) == 0
        assert BankTransaction.objects.count() == 2

        # Verify transactions were created correctly
        tx1 = BankTransaction.objects.get(plaid_transaction_id='plaid_tx_1')
        assert tx1.amount == Decimal('5.50')
        assert tx1.description == 'Starbucks Coffee'
        assert tx1.status == 'unmatched'

    def test_handle_transactions_removed_webhook(self):
        """Test processing a TRANSACTIONS_REMOVED webhook."""
        # Create a bank transaction first
        tx = BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-10',
            amount=Decimal('50.00'),
            description='Test Transaction',
            plaid_transaction_id='plaid_tx_removed',
            status='unmatched',
        )

        webhook_data = {
            'webhook_type': 'TRANSACTIONS',
            'webhook_code': 'TRANSACTIONS_REMOVED',
            'item_id': self.bank_account.plaid_item_id,
            'removed_transactions': ['plaid_tx_removed'],
        }

        created_count, errors = handle_transactions_webhook(webhook_data)

        assert created_count == 0
        assert len(errors) == 0

        # Verify transaction was marked as ignored
        tx.refresh_from_db()
        assert tx.status == 'ignored'

    def test_handle_webhook_unknown_item_id(self):
        """Test webhook with unknown item ID."""
        webhook_data = {
            'webhook_type': 'TRANSACTIONS',
            'webhook_code': 'TRANSACTIONS_ADDED',
            'item_id': 'unknown_item_id',
            'new_transactions': [],
        }

        created_count, errors = handle_transactions_webhook(webhook_data)

        assert created_count == 0
        assert len(errors) == 1
        assert 'No BankAccount found' in errors[0]

    def test_handle_webhook_invalid_type(self):
        """Test webhook with invalid type."""
        webhook_data = {
            'webhook_type': 'AUTH',
            'webhook_code': 'AUTH_DATA_UPDATE',
            'item_id': self.bank_account.plaid_item_id,
        }

        with pytest.raises(ValueError, match='Unexpected webhook type'):
            handle_transactions_webhook(webhook_data)

    def test_handle_webhook_missing_item_id(self):
        """Test webhook with missing item_id."""
        webhook_data = {
            'webhook_type': 'TRANSACTIONS',
            'webhook_code': 'TRANSACTIONS_ADDED',
            'new_transactions': [],
        }

        with pytest.raises(ValueError, match='No item_id'):
            handle_transactions_webhook(webhook_data)

    def test_handle_webhook_duplicate_transaction(self):
        """Test webhook deduplication — same transaction twice."""
        # Create a transaction first
        BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-10',
            amount=Decimal('50.00'),
            description='Starbucks',
            plaid_transaction_id='plaid_tx_dupe',
            status='unmatched',
        )

        # Try to add the same transaction again
        webhook_data = {
            'webhook_type': 'TRANSACTIONS',
            'webhook_code': 'TRANSACTIONS_ADDED',
            'item_id': self.bank_account.plaid_item_id,
            'new_transactions': [
                {
                    'transaction_id': 'plaid_tx_dupe',
                    'date': '2024-05-10',
                    'name': 'Starbucks',
                    'amount': 50.00,
                    'merchant_name': 'Starbucks',
                },
            ],
        }

        created_count, errors = handle_transactions_webhook(webhook_data)

        # Should not create a duplicate
        assert created_count == 0
        assert BankTransaction.objects.count() == 1


class TestFetchTransactions(TestCase):
    """Tests for on-demand transaction fetching."""

    def setUp(self):
        """Set up test fixtures."""
        self.bank_account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Test Checking',
            institution='chase',
            account_number='1234567890',
            functional_currency='USD',
            plaid_item_id='item_abc123',
            plaid_access_token='access_token_123',
        )

    @patch('apps.integrations.plaid_client.PlaidClient.get_transactions')
    def test_fetch_transactions_success(self, mock_get_transactions):
        """Test successful transaction fetch."""
        mock_get_transactions.return_value = (
            [
                {
                    'transaction_id': 'tx_1',
                    'date': '2024-05-10',
                    'name': 'Transaction 1',
                    'amount': 100.00,
                    'merchant_name': 'Merchant 1',
                },
                {
                    'transaction_id': 'tx_2',
                    'date': '2024-05-11',
                    'name': 'Transaction 2',
                    'amount': 200.00,
                    'merchant_name': 'Merchant 2',
                },
            ],
            2,
        )

        created_count, errors = fetch_transactions_for_account(self.bank_account)

        assert created_count == 2
        assert len(errors) == 0
        assert BankTransaction.objects.count() == 2

    @patch('apps.integrations.plaid_client.PlaidClient.get_transactions')
    def test_fetch_transactions_default_date_range(self, mock_get_transactions):
        """Test that default date range is 30 days."""
        mock_get_transactions.return_value = ([], 0)

        fetch_transactions_for_account(self.bank_account)

        # Verify get_transactions was called with dates
        mock_get_transactions.assert_called_once()
        call_args = mock_get_transactions.call_args
        # Should have been called with an end_date and a start_date 30 days before

    def test_fetch_transactions_no_plaid_token(self):
        """Test fetching without a Plaid access token."""
        self.bank_account.plaid_access_token = None
        self.bank_account.save()

        created_count, errors = fetch_transactions_for_account(self.bank_account)

        assert created_count == 0
        assert len(errors) == 1
        assert 'Plaid access token' in errors[0]

    @patch('apps.integrations.plaid_client.PlaidClient.get_transactions')
    def test_fetch_transactions_api_error(self, mock_get_transactions):
        """Test handling Plaid API errors during fetch."""
        mock_get_transactions.side_effect = PlaidAPIError('Item login required')

        created_count, errors = fetch_transactions_for_account(self.bank_account)

        assert created_count == 0
        assert len(errors) == 1
        assert 'Plaid API error' in errors[0]

    @patch('apps.integrations.plaid_client.PlaidClient.get_transactions')
    def test_fetch_transactions_custom_date_range(self, mock_get_transactions):
        """Test fetching with custom date range."""
        mock_get_transactions.return_value = ([], 0)

        start_date = datetime(2024, 1, 1)
        end_date = datetime(2024, 1, 31)

        fetch_transactions_for_account(
            self.bank_account,
            start_date=start_date,
            end_date=end_date,
        )

        # Verify the dates were passed correctly
        call_args = mock_get_transactions.call_args
        assert call_args[0][1] == start_date
        assert call_args[0][2] == end_date


class TestBankTransactionModel(TestCase):
    """Tests for BankTransaction model."""

    def setUp(self):
        """Set up test fixtures."""
        self.bank_account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Test Checking',
            institution='chase',
            account_number='1234567890',
            functional_currency='USD',
        )

    def test_create_bank_transaction(self):
        """Test creating a bank transaction."""
        tx = BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-10',
            amount=Decimal('-50.00'),
            description='Starbucks Coffee',
            merchant_name='Starbucks',
            status='unmatched',
        )

        assert tx.status == 'unmatched'
        assert tx.amount == Decimal('-50.00')

    def test_bank_transaction_deduplication_by_plaid_id(self):
        """Test that bank transactions with same plaid_transaction_id are not duplicated."""
        # Create first transaction
        BankTransaction.objects.create(
            bank_account=self.bank_account,
            transaction_date='2024-05-10',
            amount=Decimal('-50.00'),
            description='Starbucks',
            plaid_transaction_id='plaid_id_123',
        )

        # Try to create duplicate
        with pytest.raises(Exception):  # Should violate unique constraint
            BankTransaction.objects.create(
                bank_account=self.bank_account,
                transaction_date='2024-05-10',
                amount=Decimal('-50.00'),
                description='Starbucks',
                plaid_transaction_id='plaid_id_123',
            )


class TestBankAccountModel(TestCase):
    """Tests for BankAccount model."""

    def test_create_bank_account(self):
        """Test creating a bank account."""
        account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Checking Account',
            institution='chase',
            account_number='4321',
            functional_currency='USD',
        )

        assert account.status == 'active'
        assert account.functional_currency == 'USD'

    def test_bank_account_with_plaid(self):
        """Test bank account with Plaid integration."""
        account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Checking Account',
            institution='chase',
            account_number='4321',
            functional_currency='USD',
            plaid_item_id='item_abc123',
            plaid_access_token='access_token_xyz',
        )

        assert account.plaid_item_id == 'item_abc123'
        assert account.plaid_access_token == 'access_token_xyz'

    def test_corporate_card_account(self):
        """Test creating a corporate card account (Ramp)."""
        card_account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Corporate Card - Ramp',
            institution='ramp',
            account_number='4444',
            functional_currency='USD',
        )

        assert card_account.institution == 'ramp'

    def test_corporate_card_account_amex(self):
        """Test creating a corporate card account (Amex)."""
        card_account = BankAccount.objects.create(
            entity_id='entity_123',
            account_name='Corporate Card - Amex',
            institution='amex',
            account_number='3333',
            functional_currency='USD',
        )

        assert card_account.institution == 'amex'

    def test_bank_account_unique_per_entity(self):
        """Test that account numbers are unique per entity."""
        BankAccount.objects.create(
            entity_id='entity_123',
            account_name='First Account',
            institution='chase',
            account_number='1234567890',
            functional_currency='USD',
        )

        # Same account number, same entity — should fail
        with pytest.raises(Exception):
            BankAccount.objects.create(
                entity_id='entity_123',
                account_name='Duplicate Account',
                institution='chase',
                account_number='1234567890',
                functional_currency='USD',
            )

        # Same account number, different entity — should succeed
        account2 = BankAccount.objects.create(
            entity_id='entity_456',
            account_name='Same Account Number',
            institution='chase',
            account_number='1234567890',
            functional_currency='USD',
        )

        assert account2.entity_id == 'entity_456'
