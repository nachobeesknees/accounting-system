"""
Plaid API wrapper and webhook handler.

Handles:
- OAuth linking flow
- Transaction webhook processing
- Auto-fetch on schedule
- Connection failure handling
- Multi-account support
"""

import json
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import requests
from django.conf import settings
from django.utils import timezone

from .models import BankAccount, BankTransaction

logger = logging.getLogger(__name__)

# Plaid endpoints
PLAID_CLIENT_ID = settings.PLAID_CLIENT_ID if hasattr(settings, 'PLAID_CLIENT_ID') else None
PLAID_SECRET = settings.PLAID_SECRET if hasattr(settings, 'PLAID_SECRET') else None
PLAID_ENV = settings.PLAID_ENV if hasattr(settings, 'PLAID_ENV') else 'sandbox'

# Map environment to URL
PLAID_URLS = {
    'sandbox': 'https://sandbox.plaid.com',
    'development': 'https://development.plaid.com',
    'production': 'https://api.plaid.com',
}

PLAID_BASE_URL = PLAID_URLS.get(PLAID_ENV, PLAID_URLS['sandbox'])


class PlaidAPIError(Exception):
    """Raised when Plaid API returns an error."""
    pass


class PlaidClient:
    """
    Wrapper for Plaid API calls.

    Handles authentication, request/response formatting, and error handling.
    """

    def __init__(self, client_id: Optional[str] = None, secret: Optional[str] = None):
        self.client_id = client_id or PLAID_CLIENT_ID
        self.secret = secret or PLAID_SECRET

        if not self.client_id or not self.secret:
            raise ValueError("Plaid client ID and secret must be configured")

    def _request(
        self,
        endpoint: str,
        method: str = 'POST',
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Make an authenticated request to Plaid API.

        Args:
            endpoint: API endpoint (e.g., '/accounts/get')
            method: HTTP method
            data: Request body

        Returns:
            JSON response from Plaid

        Raises:
            PlaidAPIError if the response indicates an error
        """
        url = f"{PLAID_BASE_URL}{endpoint}"

        if data is None:
            data = {}

        # Add authentication
        data['client_id'] = self.client_id
        data['secret'] = self.secret

        try:
            response = requests.request(
                method,
                url,
                json=data,
                timeout=30,
            )
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            logger.error(f"Plaid API request failed: {e}")
            raise PlaidAPIError(f"Request failed: {e}") from e

        result = response.json()

        # Check for Plaid-level errors
        if 'error_code' in result:
            error_msg = f"{result.get('error_code')}: {result.get('error_message', 'Unknown error')}"
            logger.error(f"Plaid API error: {error_msg}")
            raise PlaidAPIError(error_msg)

        return result

    # ===== OAuth flow =====

    def create_link_token(
        self,
        user_id: str,
        client_name: str = "Accounting System",
        language: str = "en",
        webhook: Optional[str] = None,
    ) -> str:
        """
        Create a link token for the Plaid Link flow (user-facing OAuth).

        Args:
            user_id: Unique identifier for the user
            client_name: Display name in Plaid Link
            language: Language for Link UI
            webhook: Webhook URL for transaction updates

        Returns:
            Link token for the Link flow

        Raises:
            PlaidAPIError if the request fails
        """
        data = {
            'user': {
                'client_user_id': user_id,
            },
            'client_name': client_name,
            'language': language,
            'products': ['auth', 'transactions'],  # We need auth for account info + transactions
            'country_codes': ['US'],  # Phase 1: US only
        }

        if webhook:
            data['webhook'] = webhook

        response = self._request('/link/token/create', data=data)
        return response['link_token']

    def exchange_public_token(self, public_token: str) -> Tuple[str, str]:
        """
        Exchange a public token (from Link flow) for an access token.

        Args:
            public_token: Token returned from Plaid Link frontend

        Returns:
            (access_token, item_id) tuple

        Raises:
            PlaidAPIError if the exchange fails
        """
        response = self._request('/item/public_token/exchange', data={
            'public_token': public_token,
        })

        return response['access_token'], response['item_id']

    # ===== Account and transaction fetching =====

    def get_accounts(self, access_token: str) -> List[Dict[str, Any]]:
        """
        Get accounts for a linked item.

        Args:
            access_token: Access token for the item

        Returns:
            List of account objects with id, name, type, subtype, mask

        Raises:
            PlaidAPIError if the request fails
        """
        response = self._request('/accounts/get', data={
            'access_token': access_token,
        })

        return response.get('accounts', [])

    def get_transactions(
        self,
        access_token: str,
        start_date: datetime,
        end_date: datetime,
        account_id: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get transactions for a linked item.

        Pagination is handled internally; this returns all transactions
        in the date range.

        Args:
            access_token: Access token for the item
            start_date: Inclusive start date
            end_date: Inclusive end date
            account_id: Optional account ID to filter

        Returns:
            (transactions, total_transactions) tuple where transactions
            is the list and total_transactions is the total count

        Raises:
            PlaidAPIError if the request fails
        """
        all_transactions: List[Dict[str, Any]] = []
        offset = 0
        limit = 100

        while True:
            data = {
                'access_token': access_token,
                'start_date': start_date.date().isoformat(),
                'end_date': end_date.date().isoformat(),
                'options': {
                    'offset': offset,
                    'count': limit,
                    'include_personal_finance_category': True,
                },
            }

            if account_id:
                data['options']['account_ids'] = [account_id]

            response = self._request('/transactions/get', data=data)

            all_transactions.extend(response.get('transactions', []))

            total = response.get('total_transactions', 0)
            if len(all_transactions) >= total:
                break

            offset += limit

        return all_transactions, len(all_transactions)

    # ===== Webhook validation =====

    @staticmethod
    def verify_webhook_signature(
        body: str,
        signature: str,
        secret: Optional[str] = None,
    ) -> bool:
        """
        Verify a webhook signature from Plaid.

        Plaid signs webhooks with HMAC-SHA256.

        Args:
            body: Raw request body (JSON string)
            signature: Signature header from Plaid
            secret: Plaid secret (uses PLAID_SECRET if not provided)

        Returns:
            True if signature is valid
        """
        import hmac
        import hashlib

        secret = secret or PLAID_SECRET
        if not secret:
            logger.warning("Plaid secret not configured; cannot verify webhook")
            return False

        expected_signature = hmac.new(
            secret.encode(),
            body.encode(),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(expected_signature, signature)


# ===== Webhook handlers =====

def handle_transactions_webhook(
    webhook_data: Dict[str, Any],
) -> Tuple[int, List[str]]:
    """
    Process a TRANSACTIONS webhook from Plaid.

    Webhook types:
    - TRANSACTIONS: new transaction(s) or updates (includes added, removed, modified)
    - TRANSACTIONS_REMOVED: transactions removed from history

    Args:
        webhook_data: Parsed webhook JSON body

    Returns:
        (created_count, error_messages) tuple

    Raises:
        ValueError if webhook data is malformed
    """
    webhook_type = webhook_data.get('webhook_type')
    webhook_code = webhook_data.get('webhook_code')

    if webhook_type != 'TRANSACTIONS':
        raise ValueError(f"Unexpected webhook type: {webhook_type}")

    item_id = webhook_data.get('item_id')
    if not item_id:
        raise ValueError("No item_id in webhook")

    created_count = 0
    error_messages: List[str] = []

    # Find the bank account by Plaid item ID
    try:
        bank_account = BankAccount.objects.get(plaid_item_id=item_id)
    except BankAccount.DoesNotExist:
        msg = f"No BankAccount found for item_id {item_id}"
        logger.error(msg)
        error_messages.append(msg)
        return 0, error_messages

    if webhook_code == 'TRANSACTIONS_ADDED':
        # New transactions from Plaid
        new_transactions = webhook_data.get('new_transactions', [])
        for tx_data in new_transactions:
            try:
                tx = _create_bank_transaction_from_plaid(bank_account, tx_data)
                created_count += 1
                logger.info(f"Created bank transaction {tx.id} from Plaid webhook")
            except Exception as e:
                msg = f"Failed to create transaction: {e}"
                logger.error(msg)
                error_messages.append(msg)

    elif webhook_code == 'TRANSACTIONS_REMOVED':
        # Transactions removed by Plaid (account activity or correction)
        removed_transaction_ids = webhook_data.get('removed_transactions', [])
        for plaid_tx_id in removed_transaction_ids:
            try:
                tx = BankTransaction.objects.get(plaid_transaction_id=plaid_tx_id)
                tx.status = 'ignored'
                tx.save()
                logger.info(f"Marked bank transaction {tx.id} as ignored (removed by Plaid)")
            except BankTransaction.DoesNotExist:
                # Transaction may not exist if it was never created
                pass
            except Exception as e:
                msg = f"Failed to remove transaction {plaid_tx_id}: {e}"
                logger.error(msg)
                error_messages.append(msg)

    return created_count, error_messages


def _create_bank_transaction_from_plaid(
    bank_account: BankAccount,
    plaid_tx: Dict[str, Any],
) -> BankTransaction:
    """
    Create a BankTransaction from a Plaid transaction object.

    Args:
        bank_account: The BankAccount object
        plaid_tx: Transaction dict from Plaid API

    Returns:
        Created BankTransaction

    Raises:
        ValueError if required fields are missing
    """
    # Extract and validate required fields
    transaction_id = plaid_tx.get('transaction_id')
    if not transaction_id:
        raise ValueError("Missing transaction_id from Plaid")

    transaction_date_str = plaid_tx.get('date')
    if not transaction_date_str:
        raise ValueError("Missing date from Plaid")

    amount = plaid_tx.get('amount')
    if amount is None:
        raise ValueError("Missing amount from Plaid")

    description = plaid_tx.get('name', '').strip() or plaid_tx.get('merchant_name', 'Unknown')

    # Check for duplicates
    existing = BankTransaction.objects.filter(
        plaid_transaction_id=transaction_id
    ).first()
    if existing:
        logger.debug(f"Bank transaction {transaction_id} already exists")
        return existing

    # Create the transaction
    tx = BankTransaction(
        bank_account=bank_account,
        transaction_date=transaction_date_str,
        posted_date=plaid_tx.get('authorized_date'),  # May be null
        amount=Decimal(str(amount)),
        description=description,
        plaid_transaction_id=transaction_id,
        merchant_name=plaid_tx.get('merchant_name'),
        category=plaid_tx.get('personal_finance_category', {}).get('primary'),
        status='unmatched',
    )
    tx.save()

    return tx


def fetch_transactions_for_account(
    bank_account: BankAccount,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> Tuple[int, List[str]]:
    """
    Manually fetch transactions from Plaid for a bank account.

    Called on a schedule or on-demand (e.g., daily auto-fetch).

    Args:
        bank_account: The BankAccount to fetch for
        start_date: Inclusive start date (defaults to 30 days ago)
        end_date: Inclusive end date (defaults to today)

    Returns:
        (created_count, error_messages) tuple
    """
    if not bank_account.plaid_access_token:
        msg = f"Bank account {bank_account.id} has no Plaid access token"
        logger.warning(msg)
        return 0, [msg]

    if end_date is None:
        end_date = timezone.now()

    if start_date is None:
        start_date = end_date - timedelta(days=30)

    try:
        client = PlaidClient()
        transactions, _ = client.get_transactions(
            bank_account.plaid_access_token,
            start_date,
            end_date,
        )
    except PlaidAPIError as e:
        msg = f"Plaid API error fetching transactions: {e}"
        logger.error(msg)
        return 0, [msg]

    created_count = 0
    error_messages: List[str] = []

    for plaid_tx in transactions:
        try:
            _create_bank_transaction_from_plaid(bank_account, plaid_tx)
            created_count += 1
        except Exception as e:
            msg = f"Failed to create transaction: {e}"
            logger.error(msg)
            error_messages.append(msg)

    logger.info(f"Fetched {created_count} transactions for bank account {bank_account.id}")

    return created_count, error_messages
