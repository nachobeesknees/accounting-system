"""
Reconciliation engine for bank accounts and corporate cards.

Handles:
- Auto-matching GL entries to bank transactions (amount + date + memo)
- Flagging unmatched items for manual review
- Calculating beginning balance, statement balance, book balance
- Generating reconciliation summary (outstanding items, timing differences)
- Supporting approval chain

Key invariant:
- A reconciliation is incomplete until book_balance + outstanding_items_effect == statement_balance
- Bank transaction amount must match GL entry amount exactly (no rounding)
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Tuple, Optional

from django.db.models import Q, Sum
from django.utils import timezone

from .models import (
    BankAccount,
    BankTransaction,
    BankReconciliation,
    BankReconciliationLine,
)

logger = logging.getLogger(__name__)


class ReconciliationEngine:
    """
    Engine for automatic matching and reconciliation logic.

    Matching strategy:
    1. Exact match: amount + transaction_date + description keyword
    2. Fuzzy date match: amount + within N days + description keyword
    3. Manual matching: user provides GL entry ID
    """

    # Configuration
    MATCHING_WINDOW_DAYS = 5  # Allow matches within 5 days
    DESCRIPTION_MATCH_THRESHOLD = 0.8  # Fuzzy match threshold

    def __init__(self, bank_account: BankAccount):
        self.bank_account = bank_account

    def create_reconciliation(
        self,
        as_of_date: datetime,
        statement_balance: Decimal,
    ) -> BankReconciliation:
        """
        Create a new reconciliation for a bank account.

        Args:
            as_of_date: Reconciliation cutoff date
            statement_balance: Balance per bank statement

        Returns:
            New BankReconciliation object (saved to DB)
        """
        # Get the previous reconciliation to use its ending balance
        previous_recon = BankReconciliation.objects.filter(
            bank_account=self.bank_account,
            as_of_date__lt=as_of_date,
        ).order_by('-as_of_date').first()

        beginning_balance = Decimal('0')
        if previous_recon:
            # Use the book balance from the previous recon
            beginning_balance = previous_recon.book_balance

        # Calculate book balance from GL transactions through as_of_date
        book_balance = self._calculate_book_balance(as_of_date)

        recon = BankReconciliation(
            bank_account=self.bank_account,
            as_of_date=as_of_date.date() if isinstance(as_of_date, datetime) else as_of_date,
            beginning_balance_per_books=beginning_balance,
            statement_balance=statement_balance,
            book_balance=book_balance,
            variance=statement_balance - book_balance,
            status='incomplete',
        )
        recon.save()

        logger.info(f"Created reconciliation {recon.id} for bank account {self.bank_account.id}")

        return recon

    def auto_match(self, reconciliation: BankReconciliation) -> Tuple[int, List[str]]:
        """
        Automatically match unmatched bank transactions to GL entries.

        Strategy:
        1. For each unmatched bank transaction:
           a. Look for GL entries with matching amount
           b. Filter by transaction date +/- MATCHING_WINDOW_DAYS
           c. Filter by description keywords
           d. If exactly one match found, create match
           e. Otherwise, flag for manual review

        Args:
            reconciliation: The BankReconciliation to match items for

        Returns:
            (matched_count, error_messages) tuple
        """
        matched_count = 0
        error_messages: List[str] = []

        # Get unmatched transactions for this bank account
        # that haven't already been matched in this recon
        unmatched_txs = BankTransaction.objects.filter(
            bank_account=self.bank_account,
            transaction_date__lte=reconciliation.as_of_date,
            status='unmatched',
        ).exclude(
            id__in=BankReconciliationLine.objects.filter(
                reconciliation=reconciliation,
                bank_transaction__isnull=False,
            ).values_list('bank_transaction_id', flat=True)
        )

        for bank_tx in unmatched_txs:
            try:
                # Try to find a matching GL entry
                matched_entry_id, matched_line_id = self._find_matching_gl_entry(
                    bank_tx,
                    reconciliation,
                )

                if matched_entry_id:
                    # Create the match in the reconciliation
                    self._create_match(
                        reconciliation,
                        bank_tx,
                        matched_entry_id,
                        matched_line_id,
                    )
                    matched_count += 1
                    logger.debug(
                        f"Matched bank transaction {bank_tx.id} "
                        f"to GL entry {matched_entry_id}"
                    )
                else:
                    # Create an unmatched line for manual review
                    self._create_unmatched_line(reconciliation, bank_tx)

            except Exception as e:
                msg = f"Error auto-matching transaction {bank_tx.id}: {e}"
                logger.error(msg)
                error_messages.append(msg)

        logger.info(
            f"Auto-matched {matched_count} transactions for reconciliation {reconciliation.id}"
        )

        return matched_count, error_messages

    def _find_matching_gl_entry(
        self,
        bank_tx: BankTransaction,
        reconciliation: BankReconciliation,
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Find a matching GL entry for a bank transaction.

        Matching algorithm:
        1. Exact amount match
        2. Transaction date within window
        3. Description contains keywords

        Returns:
            (journal_entry_id, journal_line_id) tuple, or (None, None) if no match

        NOTE: This is a stub — actual implementation requires GL models
        to exist and be queried. For now, returns no matches.
        """
        # TODO: Implement when GL models are available
        # For now, this is a placeholder that returns no matches
        return None, None

    def _create_match(
        self,
        reconciliation: BankReconciliation,
        bank_tx: BankTransaction,
        journal_entry_id: str,
        journal_line_id: str,
    ) -> None:
        """Create a matched reconciliation line."""
        line = BankReconciliationLine(
            reconciliation=reconciliation,
            line_type='matched',
            bank_transaction=bank_tx,
            journal_entry_id=journal_entry_id,
            journal_line_id=journal_line_id,
            amount=bank_tx.amount,
            description=bank_tx.description,
            transaction_date=bank_tx.transaction_date,
        )
        line.save()

        # Update bank transaction status
        bank_tx.status = 'matched'
        bank_tx.matched_journal_entry_id = journal_entry_id
        bank_tx.matched_journal_line_id = journal_line_id
        bank_tx.save()

    def _create_unmatched_line(
        self,
        reconciliation: BankReconciliation,
        bank_tx: BankTransaction,
    ) -> None:
        """Create an unmatched reconciliation line for manual review."""
        line = BankReconciliationLine(
            reconciliation=reconciliation,
            line_type='unmatched',
            bank_transaction=bank_tx,
            amount=bank_tx.amount,
            description=bank_tx.description,
            transaction_date=bank_tx.transaction_date,
        )
        line.save()

    def _calculate_book_balance(self, as_of_date) -> Decimal:
        """
        Calculate the book balance as of a date.

        Book balance = beginning balance (from last recon) + net transactions through date

        NOTE: This requires GL models to calculate the actual journal entry sum.
        For now, this is a stub that returns 0.
        """
        # TODO: Implement when GL models are available
        # For now, just return 0 as a placeholder
        return Decimal('0')

    def flag_outstanding_items(self, reconciliation: BankReconciliation) -> int:
        """
        Find GL entries that haven't appeared in the bank yet.

        Outstanding items are GL entries that:
        - Are dated before as_of_date
        - Are not matched to any bank transaction in this or prior reconciliations

        Args:
            reconciliation: The BankReconciliation

        Returns:
            Count of outstanding items created
        """
        # TODO: Implement when GL models are available
        return 0

    def calculate_variance(self, reconciliation: BankReconciliation) -> Decimal:
        """
        Calculate and store the variance.

        variance = statement_balance - (book_balance + outstanding_items_net_effect)

        Returns:
            The variance (should be 0 if reconciliation is complete)
        """
        # Calculate net effect of outstanding items
        outstanding_effect = BankReconciliationLine.objects.filter(
            reconciliation=reconciliation,
            line_type='outstanding',
        ).aggregate(net=Sum('amount'))['net'] or Decimal('0')

        expected_book_balance = reconciliation.statement_balance - outstanding_effect

        variance = reconciliation.statement_balance - (
            reconciliation.book_balance + outstanding_effect
        )

        reconciliation.variance = variance
        reconciliation.save()

        return variance

    def is_complete(self, reconciliation: BankReconciliation) -> bool:
        """
        Check if a reconciliation is complete.

        Complete when:
        - variance == 0
        - No unmatched items with amount > threshold

        Args:
            reconciliation: The BankReconciliation

        Returns:
            True if complete
        """
        if reconciliation.variance != Decimal('0'):
            return False

        # Check for large unmatched items
        large_unmatched = BankReconciliationLine.objects.filter(
            reconciliation=reconciliation,
            line_type='unmatched',
        ).filter(
            amount__abs__gt=Decimal('1000')  # Arbitrary threshold
        ).exists()

        return not large_unmatched

    def generate_summary(self, reconciliation: BankReconciliation) -> dict:
        """
        Generate a reconciliation summary for reporting.

        Returns:
            Dict with summary data for templates/reports
        """
        matched_lines = BankReconciliationLine.objects.filter(
            reconciliation=reconciliation,
            line_type='matched',
        )
        outstanding_lines = BankReconciliationLine.objects.filter(
            reconciliation=reconciliation,
            line_type='outstanding',
        )
        unmatched_lines = BankReconciliationLine.objects.filter(
            reconciliation=reconciliation,
            line_type='unmatched',
        )

        matched_count = matched_lines.count()
        outstanding_count = outstanding_lines.count()
        unmatched_count = unmatched_lines.count()

        outstanding_total = outstanding_lines.aggregate(Sum('amount'))['amount__sum'] or Decimal('0')

        return {
            'as_of_date': reconciliation.as_of_date,
            'status': reconciliation.status,
            'beginning_balance_per_books': reconciliation.beginning_balance_per_books,
            'statement_balance': reconciliation.statement_balance,
            'book_balance': reconciliation.book_balance,
            'variance': reconciliation.variance,
            'matched_count': matched_count,
            'outstanding_count': outstanding_count,
            'unmatched_count': unmatched_count,
            'outstanding_total': outstanding_total,
            'is_complete': self.is_complete(reconciliation),
        }


def create_daily_bank_reconciliation_task() -> None:
    """
    Scheduled task to create and auto-reconcile bank accounts.

    Called daily or on-demand. For each active bank account:
    1. Get the most recent statement (stub for now)
    2. Create a reconciliation
    3. Auto-match transactions
    4. Log summary

    NOTE: This requires integration with bank statements.
    For now, this is a placeholder.
    """
    logger.info("Starting daily bank reconciliation task")

    for bank_account in BankAccount.objects.filter(status='active'):
        try:
            engine = ReconciliationEngine(bank_account)
            # TODO: Get statement balance from bank feed or statement file
            statement_balance = Decimal('0')
            recon = engine.create_reconciliation(timezone.now(), statement_balance)
            engine.auto_match(recon)
            summary = engine.generate_summary(recon)
            logger.info(f"Reconciliation summary for {bank_account.id}: {summary}")
        except Exception as e:
            logger.error(f"Error reconciling {bank_account.id}: {e}")
