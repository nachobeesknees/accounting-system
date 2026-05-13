"""
Consolidation Engine for multi-entity corporate accounting.

Handles:
1. Intercompany transaction matching (sender/receiver pairs)
2. Mismatch detection and flagging
3. Trial balance roll-up with consolidation mapping
4. Currency translation per ASC 830
5. Elimination adjustments
6. Sub-consolidation for holding company structures

All operations read from entity books (never modified).
Adjustments, eliminations, and translations live on the consolidation layer.
"""

from decimal import Decimal, ROUND_HALF_EVEN
from datetime import date, datetime
from typing import Dict, List, Tuple, Optional, Set
from collections import defaultdict
import logging

from django.db.models import Q, Sum, F, Case, When, DecimalField, Value
from django.utils import timezone
from django.contrib.auth.models import User

from .models import (
    Entity,
    EntityOwnership,
    Period,
    Account,
    JournalEntry,
    JournalLine,
    FXRate,
    ConsolidationAccount,
    ConsolidationMapping,
    IntercompanyTransaction,
    ConsolidationRun,
    ConsolidationAdjustment,
    ConsolidationAdjustmentLine,
)

logger = logging.getLogger(__name__)


# ============================================================================
# INTERCOMPANY MATCHING ENGINE
# ============================================================================

class IntercompanyMatcher:
    """
    Matches GL entries across entities to identify intercompany transactions.
    Detects mismatches and flags exceptions for manual resolution.
    """

    def __init__(self, tolerance_percent: Decimal = Decimal('0.00')):
        """
        Args:
            tolerance_percent: Allowed variance percentage (0.0 = exact match required)
        """
        self.tolerance_percent = tolerance_percent

    def match_entries(
        self,
        entity_pair: Tuple[Entity, Entity],
        as_of_date: date,
        period_lookback_days: int = 93
    ) -> List[Dict]:
        """
        Find matching intercompany transaction pairs between two entities.

        Returns list of dicts with:
        - sender_entry_id
        - receiver_entry_id
        - status: 'matched', 'mismatched', or 'unmatched'
        - mismatch_detail
        - tolerance_met: bool
        """
        sender_entity, receiver_entity = entity_pair
        results = []

        # Find entries with intercompany_pair_id already set
        paired_entries = JournalEntry.objects.filter(
            intercompany_pair_id__isnull=False
        ).select_related('entity').prefetch_related('lines')

        # Find unpaired intercompany entries (by reference convention or account type)
        unpaired = self._find_unpaired_intercompany_entries(sender_entity, receiver_entity, as_of_date)

        for sender_entry, receiver_entry in unpaired:
            match_result = self._compare_entries(sender_entry, receiver_entry)
            results.append(match_result)

        return results

    def _find_unpaired_intercompany_entries(
        self,
        entity1: Entity,
        entity2: Entity,
        as_of_date: date
    ) -> List[Tuple[JournalEntry, JournalEntry]]:
        """
        Find entries that likely represent an intercompany transaction.
        Heuristics:
        - Both entities involved
        - Same reference number or date
        - One debit, one credit across entity boundaries
        """
        pairs = []

        # Get entries from both entities up to as_of_date
        entries_e1 = JournalEntry.objects.filter(
            entity=entity1,
            entry_date__lte=as_of_date,
            intercompany_pair_id__isnull=True,
            status='posted'
        ).prefetch_related('lines')

        entries_e2 = JournalEntry.objects.filter(
            entity=entity2,
            entry_date__lte=as_of_date,
            intercompany_pair_id__isnull=True,
            status='posted'
        ).prefetch_related('lines')

        # Simple matching by reference and date (within 3 days)
        for e1 in entries_e1:
            for e2 in entries_e2:
                if self._entries_match_heuristic(e1, e2):
                    pairs.append((e1, e2))

        return pairs

    def _entries_match_heuristic(self, e1: JournalEntry, e2: JournalEntry) -> bool:
        """Check if two entries from different entities represent same transaction."""
        # Same reference number
        if e1.reference and e1.reference == e2.reference:
            return True
        # Same entry date
        if e1.entry_date == e2.entry_date:
            # And total amount matches
            total1 = sum(line.debit or line.credit for line in e1.lines.all())
            total2 = sum(line.debit or line.credit for line in e2.lines.all())
            if total1 == total2:
                return True
        return False

    def _compare_entries(self, sender: JournalEntry, receiver: JournalEntry) -> Dict:
        """
        Compare two entries in detail.
        Returns dict with match status, mismatches, and tolerance check.
        """
        result = {
            'sender_entry_id': str(sender.id),
            'receiver_entry_id': str(receiver.id),
            'status': 'matched',
            'mismatch_type': None,
            'mismatch_detail': '',
            'tolerance_met': True,
        }

        # Get line amounts
        sender_amount = self._get_entry_amount(sender)
        receiver_amount = self._get_entry_amount(receiver)

        # Check currency match
        if sender.transaction_currency != receiver.transaction_currency:
            result['status'] = 'mismatched'
            result['mismatch_type'] = 'currency'
            result['mismatch_detail'] = f"{sender.transaction_currency} vs {receiver.transaction_currency}"
            return result

        # Check amount match
        variance = abs(sender_amount - receiver_amount)
        tolerance = (sender_amount * self.tolerance_percent / Decimal('100')).quantize(
            Decimal('0.0001'),
            rounding=ROUND_HALF_EVEN
        )

        if variance > tolerance:
            result['status'] = 'mismatched'
            result['mismatch_type'] = 'amount'
            result['mismatch_detail'] = f"Sender: {sender_amount}, Receiver: {receiver_amount}, Variance: {variance}"
            result['tolerance_met'] = False
            return result

        # Check date match (within 3 days)
        days_diff = abs((sender.entry_date - receiver.entry_date).days)
        if days_diff > 3:
            result['status'] = 'mismatched'
            result['mismatch_type'] = 'date'
            result['mismatch_detail'] = f"{days_diff} days difference"
            return result

        return result

    def _get_entry_amount(self, entry: JournalEntry) -> Decimal:
        """Get absolute amount of entry (sum of all debits or credits)."""
        total = entry.lines.aggregate(
            total=Sum(Case(
                When(debit__gt=0, then='debit'),
                When(credit__gt=0, then='credit'),
                output_field=DecimalField()
            ))
        )['total'] or Decimal('0')
        return total


# ============================================================================
# CONSOLIDATION ROLL-UP ENGINE
# ============================================================================

class ConsolidationRollupEngine:
    """
    Rolls up trial balances from entities into consolidated layer.
    Applies consolidation mapping and currency translation.
    """

    def __init__(self, fx_converter: 'FXConverter'):
        self.fx = fx_converter

    def roll_up_trial_balance(
        self,
        consolidation_run: ConsolidationRun,
        entities: List[Entity]
    ) -> Dict[str, Decimal]:
        """
        Roll up consolidated trial balance from entities.

        Returns dict: {consolidation_account_id: balance}

        Process:
        1. Get trial balance for each entity as of consolidation date
        2. Map entity accounts to consolidation accounts
        3. Translate to reporting currency
        4. Sum all entities
        """
        consolidated_balance = defaultdict(Decimal)

        for entity in entities:
            # Get entity's trial balance
            entity_tb = self._get_entity_trial_balance(entity, consolidation_run.as_of_date)

            # Map and translate
            for account_id, balance in entity_tb.items():
                account = Account.objects.get(id=account_id)
                cons_acct = self._get_mapped_account(account, consolidation_run.as_of_date)

                if not cons_acct:
                    logger.warning(
                        f"Account {account.code} in {entity.legal_name} has no consolidation mapping"
                    )
                    continue

                # Translate balance if needed
                translated_balance = self.fx.translate_balance(
                    amount=balance,
                    from_currency=entity.functional_currency,
                    to_currency=consolidation_run.reporting_currency,
                    translation_date=consolidation_run.as_of_date,
                    account_type=account.account_type
                )

                consolidated_balance[str(cons_acct.id)] += translated_balance

        return dict(consolidated_balance)

    def _get_entity_trial_balance(self, entity: Entity, as_of_date: date) -> Dict[str, Decimal]:
        """Get trial balance for entity as of date."""
        tb = defaultdict(Decimal)

        # Get all posted entries up to date in entity
        lines = JournalLine.objects.filter(
            journal_entry__entity=entity,
            journal_entry__entry_date__lte=as_of_date,
            journal_entry__status='posted'
        ).select_related('journal_entry')

        for line in lines:
            account_id = str(line.account_id)
            # Use functional_amount
            tb[account_id] += line.functional_amount

        return tb

    def _get_mapped_account(self, entity_account: Account, as_of_date: date) -> Optional[ConsolidationAccount]:
        """Get the consolidation account mapped to an entity account on a given date."""
        mapping = ConsolidationMapping.objects.filter(
            entity=entity_account.entity,
            account=entity_account,
            effective_from__lte=as_of_date
        ).exclude(effective_to__isnull=False, effective_to__lt=as_of_date).first()

        return mapping.consolidation_account if mapping else None


# ============================================================================
# FX CONVERSION & TRANSLATION ENGINE (ASC 830)
# ============================================================================

class FXConverter:
    """
    Handles currency conversion and translation per ASC 830.

    Rules:
    - Transaction posting: use rate effective on entry_date
    - Period-end remeasurement: monetary assets/liabilities at current rate
    - Consolidation translation:
      - Balance sheet: current rate (period-end)
      - Income statement: average rate
      - Equity: historical rate
      - Plug to OCI (CTA)
    """

    def convert_transaction(
        self,
        amount: Decimal,
        from_currency: str,
        to_currency: str,
        conversion_date: date
    ) -> Decimal:
        """
        Convert transaction-to-functional currency at rate effective on conversion_date.
        """
        if from_currency == to_currency:
            return amount

        rate = self._get_rate(from_currency, to_currency, conversion_date, rate_type='spot')
        if not rate:
            raise ValueError(f"No FX rate found for {from_currency}/{to_currency} on {conversion_date}")

        converted = (amount * rate).quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)
        return converted

    def translate_balance(
        self,
        amount: Decimal,
        from_currency: str,
        to_currency: str,
        translation_date: date,
        account_type: str
    ) -> Decimal:
        """
        Translate balance for consolidation per ASC 830.

        Args:
            amount: Balance in from_currency
            from_currency: Source currency (entity's functional currency)
            to_currency: Reporting currency
            translation_date: Period-end date (for current rate)
            account_type: Type of account (asset/liability/equity/revenue/expense)

        Returns:
            Translated amount in to_currency
        """
        if from_currency == to_currency:
            return amount

        if account_type in ['revenue', 'expense']:
            # Income statement: average rate for period
            # TODO: calculate average rate for period
            # For now, use period-end as proxy
            rate = self._get_rate(from_currency, to_currency, translation_date, rate_type='average')
        elif account_type == 'equity':
            # Equity: historical rate (would need to track per transaction)
            # For now, use period-end as proxy
            rate = self._get_rate(from_currency, to_currency, translation_date, rate_type='spot')
        else:
            # Balance sheet (assets/liabilities): current rate (period-end)
            rate = self._get_rate(from_currency, to_currency, translation_date, rate_type='spot')

        if not rate:
            raise ValueError(f"No FX rate found for {from_currency}/{to_currency} on {translation_date}")

        translated = (amount * rate).quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)
        return translated

    def _get_rate(
        self,
        from_currency: str,
        to_currency: str,
        effective_date: date,
        rate_type: str = 'spot'
    ) -> Optional[Decimal]:
        """
        Get FX rate effective on or before a date.

        Returns rate such that: 1 from_currency = rate to_currency
        """
        rate_obj = FXRate.objects.filter(
            from_currency=from_currency,
            to_currency=to_currency,
            effective_date__lte=effective_date,
            rate_type=rate_type
        ).order_by('-effective_date').first()

        return rate_obj.rate if rate_obj else None


# ============================================================================
# ELIMINATION ADJUSTMENT ENGINE
# ============================================================================

class EliminationAdjustmentEngine:
    """
    Creates elimination adjustments for intercompany transactions.

    Eliminates:
    1. Intercompany receivables / payables
    2. Intercompany revenue / expense
    3. Intercompany investments (parent's investment in sub)
    4. Unrealized profit in intercompany inventory (if material)
    """

    def create_eliminations(
        self,
        consolidation_run: ConsolidationRun,
        user: User
    ) -> List[ConsolidationAdjustment]:
        """
        Create elimination adjustments for all matched intercompany transactions.
        """
        adjustments = []

        # Get all matched intercompany transactions
        matched_ics = IntercompanyTransaction.objects.filter(
            status=IntercompanyTransaction.Status.MATCHED
        ).select_related('sender_entry', 'receiver_entry')

        for ic in matched_ics:
            adj = self._create_elimination_for_transaction(ic, consolidation_run, user)
            if adj:
                adjustments.append(adj)

        return adjustments

    def _create_elimination_for_transaction(
        self,
        ic: IntercompanyTransaction,
        consolidation_run: ConsolidationRun,
        user: User
    ) -> Optional[ConsolidationAdjustment]:
        """
        Create elimination adjustment to zero out matching IC transaction.

        General approach:
        - Debit the receiver's payable
        - Credit the sender's receivable
        Both at the matched amount in reporting currency
        """
        sender_entry = ic.sender_entry
        receiver_entry = ic.receiver_entry

        # Get amount to eliminate
        amount = sum(
            line.debit or line.credit
            for line in sender_entry.lines.all()
        )

        if amount == 0:
            return None

        # Create adjustment
        adj = ConsolidationAdjustment.objects.create(
            consolidation_run=consolidation_run,
            adjustment_type=ConsolidationAdjustment.AdjustmentType.ELIMINATION,
            description=f"Eliminate IC transaction {ic.id}",
            status=ConsolidationAdjustment.AdjustmentStatus.DRAFT,
            intercompany_transaction=ic,
            created_by=user,
            updated_by=user,
        )

        # Create lines: reverse both sides to zero them out
        # Line 1: Debit receiver's payable / Credit sender's receivable equivalent
        # (mapping to consolidation accounts)
        # TODO: determine which consolidation accounts to use

        return adj


# ============================================================================
# CONSOLIDATION ORCHESTRATOR
# ============================================================================

class ConsolidationOrchestrator:
    """
    High-level orchestration of the consolidation process.

    Steps:
    1. Validate scope (entities, dates, periods)
    2. Run intercompany matching
    3. Check for unresolved mismatches (block if found)
    4. Roll up trial balances
    5. Apply translations
    6. Create elimination adjustments
    7. Apply basis normalization adjustments
    8. Calculate minority interest
    9. Generate consolidated financials
    """

    def __init__(self, user: User):
        self.user = user
        self.fx_converter = FXConverter()
        self.rollup = ConsolidationRollupEngine(self.fx_converter)
        self.matcher = IntercompanyMatcher()
        self.eliminator = EliminationAdjustmentEngine()

    def execute_consolidation(
        self,
        consolidation_run: ConsolidationRun
    ) -> Dict:
        """
        Execute complete consolidation process.

        Returns:
        - status: 'complete' or 'blocked'
        - message: summary
        - consolidated_tb: {consolidation_account_id: balance}
        - issues: list of blocking issues (if blocked)
        """
        result = {
            'status': ConsolidationRun.Status.IN_PROGRESS,
            'message': '',
            'consolidated_tb': {},
            'issues': [],
        }

        try:
            # Step 1: Validate scope
            issues = self._validate_scope(consolidation_run)
            if issues:
                result['status'] = ConsolidationRun.Status.BLOCKED
                result['issues'] = issues
                consolidation_run.status = ConsolidationRun.Status.BLOCKED
                consolidation_run.save()
                return result

            # Step 2: Get entities in scope
            entities = self._get_scope_entities(consolidation_run)

            # Step 3: Match intercompany transactions
            self._match_all_intercompany(entities, consolidation_run.as_of_date)

            # Step 4: Check for unresolved mismatches
            unresolved = IntercompanyTransaction.objects.filter(
                status=IntercompanyTransaction.Status.MISMATCHED
            )
            if unresolved.exists():
                result['status'] = ConsolidationRun.Status.BLOCKED
                result['issues'] = [
                    f"Unresolved intercompany mismatches: {unresolved.count()}"
                ]
                consolidation_run.status = ConsolidationRun.Status.BLOCKED
                consolidation_run.save()
                return result

            # Step 5: Roll up trial balances
            consolidated_tb = self.rollup.roll_up_trial_balance(consolidation_run, entities)

            # Step 6: Create eliminations
            eliminations = self.eliminator.create_eliminations(consolidation_run, self.user)
            logger.info(f"Created {len(eliminations)} elimination adjustments")

            # Mark consolidation complete
            result['status'] = ConsolidationRun.Status.COMPLETE
            result['consolidated_tb'] = consolidated_tb
            result['message'] = f"Consolidation complete: {len(entities)} entities, {len(eliminations)} eliminations"

            consolidation_run.status = ConsolidationRun.Status.COMPLETE
            consolidation_run.completed_at = timezone.now()
            consolidation_run.executed_by = self.user
            consolidation_run.save()

        except Exception as e:
            result['status'] = ConsolidationRun.Status.BLOCKED
            result['issues'] = [str(e)]
            logger.exception("Consolidation failed")

        return result

    def _validate_scope(self, consolidation_run: ConsolidationRun) -> List[str]:
        """Validate consolidation scope and date."""
        issues = []

        if not consolidation_run.parent_entity:
            issues.append("No parent entity specified")

        if not consolidation_run.entities_in_scope:
            issues.append("No entities in scope")

        # Check all entities have closed periods up to consolidation date
        for entity_id in consolidation_run.entities_in_scope:
            entity = Entity.objects.get(id=entity_id)
            open_periods = Period.objects.filter(
                entity=entity,
                status='open',
                end_date__lte=consolidation_run.as_of_date
            )
            if open_periods.exists():
                issues.append(
                    f"Entity {entity.legal_name} has open periods before {consolidation_run.as_of_date}"
                )

        return issues

    def _get_scope_entities(self, consolidation_run: ConsolidationRun) -> List[Entity]:
        """Get all entities in scope for this consolidation."""
        return Entity.objects.filter(id__in=consolidation_run.entities_in_scope)

    def _match_all_intercompany(self, entities: List[Entity], as_of_date: date):
        """Match intercompany transactions across all entity pairs in scope."""
        # For each pair, run matching
        for i, entity1 in enumerate(entities):
            for entity2 in entities[i + 1:]:
                results = self.matcher.match_entries((entity1, entity2), as_of_date)
                for result in results:
                    # Create or update IntercompanyTransaction records
                    # TODO: update transaction status based on result
                    pass
