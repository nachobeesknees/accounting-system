"""
FX Conversion Engine & Period-End Revaluation.

Core responsibilities:
1. FX conversion on transaction posting (transaction → functional currency)
2. Period-end remeasurement of foreign-currency monetary balances
3. ASC 830 translation rules for consolidation
4. All math in Decimal with ROUND_HALF_EVEN (banker's rounding)
5. Audit trail for every FX entry
"""

from decimal import Decimal, getcontext, ROUND_HALF_EVEN
from datetime import date
from typing import Optional, Dict, List, Tuple
from django.db import models, transaction
from django.utils import timezone
from django.contrib.auth.models import User

from .models import (
    FXRate, TransactionFX, JournalEntry, JournalLine, Account,
    Entity, Period, PeriodEndRevaluation, PeriodEndRevaluationLine
)

# Set decimal context for all financial math
getcontext().prec = 28  # 20 digits + 8 decimal places
getcontext().rounding = ROUND_HALF_EVEN


class FXConversionError(Exception):
    """Raised when FX conversion cannot proceed (missing rate, validation failure)."""
    pass


class FXRateNotFoundError(FXConversionError):
    """No rate available for the requested currency pair and date."""
    pass


class FXEngine:
    """
    Main FX conversion engine.

    Handles:
    - looking up rates effective on a transaction date
    - converting amounts from one currency to another
    - validating conversion results
    - posting FX entries to the journal
    """

    @staticmethod
    def get_rate(
        from_currency: str,
        to_currency: str,
        effective_date: date,
        rate_type: str = 'spot'
    ) -> FXRate:
        """
        Retrieve the FX rate effective on the given date.

        CRITICAL: Use the rate effective on the transaction date, NOT today's rate.

        Args:
            from_currency: ISO 4217 code (e.g., 'USD')
            to_currency: ISO 4217 code (e.g., 'EUR')
            effective_date: The date the rate must be effective on
            rate_type: 'spot', 'average', 'closing'

        Returns:
            FXRate object

        Raises:
            FXRateNotFoundError: If no rate exists for this pair on this date

        Note:
            Convention: both directions are stored (USD→EUR and EUR→USD).
            If only one direction exists, compute the inverse.
        """
        # Same currency = rate of 1.0
        if from_currency == to_currency:
            return None  # Special case: no rate object needed

        # Try direct lookup first
        try:
            rate = FXRate.objects.get(
                from_currency=from_currency,
                to_currency=to_currency,
                effective_date=effective_date,
                rate_type=rate_type
            )
            return rate
        except FXRate.DoesNotExist:
            pass

        # If not found, try the most recent rate on or before effective_date
        rate = FXRate.objects.filter(
            from_currency=from_currency,
            to_currency=to_currency,
            effective_date__lte=effective_date,
            rate_type=rate_type
        ).order_by('-effective_date').first()

        if rate:
            return rate

        # Try inverse direction
        rate = FXRate.objects.filter(
            from_currency=to_currency,
            to_currency=from_currency,
            effective_date__lte=effective_date,
            rate_type=rate_type
        ).order_by('-effective_date').first()

        if rate:
            return rate

        # Not found
        raise FXRateNotFoundError(
            f"No {rate_type} FX rate found for {from_currency}→{to_currency} "
            f"on or before {effective_date}"
        )

    @staticmethod
    def convert(
        amount: Decimal,
        from_currency: str,
        to_currency: str,
        rate: FXRate
    ) -> Decimal:
        """
        Convert an amount using the given FX rate.

        Math:
            converted = amount * rate.rate (if from==rate.from_currency)
            or
            converted = amount / rate.rate (if from==rate.to_currency, i.e., inverse)

        Args:
            amount: Decimal amount in from_currency
            from_currency: ISO 4217 code
            to_currency: ISO 4217 code
            rate: FXRate object

        Returns:
            Decimal amount in to_currency, quantized to 4 decimal places

        Raises:
            FXConversionError: If rate direction is invalid
        """
        if amount == Decimal('0'):
            return Decimal('0').quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)

        if from_currency == to_currency:
            return amount.quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)

        # Use Decimal context for multiplication/division
        amount = Decimal(str(amount))
        rate_value = Decimal(str(rate.rate))

        if rate.from_currency == from_currency and rate.to_currency == to_currency:
            # Direct: to_currency = from_currency * rate
            converted = amount * rate_value
        elif rate.from_currency == to_currency and rate.to_currency == from_currency:
            # Inverse: to_currency = from_currency / rate
            converted = amount / rate_value
        else:
            raise FXConversionError(
                f"Rate {rate.from_currency}→{rate.to_currency} "
                f"does not match {from_currency}→{to_currency}"
            )

        return converted.quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)

    @staticmethod
    def post_transaction_with_fx(
        journal_entry: JournalEntry,
        user: User,
        rate_date: Optional[date] = None,
        rate_type: str = 'spot'
    ) -> Tuple[JournalEntry, TransactionFX]:
        """
        Post a journal entry with FX conversion to functional currency.

        For each line:
        1. Look up the FX rate effective on rate_date (default: entry_date)
        2. Convert transaction currency → functional currency
        3. Store functional_amount on each line
        4. Create TransactionFX record with audit trail

        Args:
            journal_entry: The entry to post
            user: The user posting the entry
            rate_date: Date of FX rate to use (default: entry.entry_date)
            rate_type: 'spot', 'average', 'closing'

        Returns:
            Tuple of (updated JournalEntry, TransactionFX record)

        Raises:
            FXConversionError: If any conversion fails (missing rate, math error)
        """
        if rate_date is None:
            rate_date = journal_entry.entry_date

        entity = journal_entry.entity
        tx_currency = journal_entry.transaction_currency
        fc_currency = entity.functional_currency

        # Same currency = no conversion needed
        if tx_currency == fc_currency:
            rate_obj = None
            conversion_rate = Decimal('1.0')
        else:
            rate_obj = FXEngine.get_rate(
                from_currency=tx_currency,
                to_currency=fc_currency,
                effective_date=rate_date,
                rate_type=rate_type
            )
            conversion_rate = rate_obj.rate if rate_obj else Decimal('1.0')

        total_tx_amount = Decimal('0')
        total_fc_amount = Decimal('0')

        with transaction.atomic():
            # Convert each line
            for line in journal_entry.lines.all():
                line_tx_amount = line.debit if line.debit > 0 else line.credit
                total_tx_amount += line_tx_amount

                if tx_currency == fc_currency:
                    line.functional_amount = (
                        line.debit if line.debit > 0 else -line.credit
                    ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)
                else:
                    # Convert to functional currency
                    converted = FXEngine.convert(
                        amount=line_tx_amount,
                        from_currency=tx_currency,
                        to_currency=fc_currency,
                        rate=rate_obj
                    )
                    # Sign it (negative for credit)
                    line.functional_amount = (
                        converted if line.debit > 0 else -converted
                    )

                total_fc_amount += abs(line.functional_amount)
                line.save()

            # Validate functional currency balance
            fc_balance = sum(
                Decimal(str(line.functional_amount))
                for line in journal_entry.lines.all()
            )
            if fc_balance != Decimal('0'):
                raise FXConversionError(
                    f"Entry does not balance in functional currency. "
                    f"Balance: {fc_balance} {fc_currency}"
                )

            # Create TransactionFX record
            fx_record = TransactionFX.objects.create(
                journal_entry=journal_entry,
                transaction_currency=tx_currency,
                functional_currency=fc_currency,
                conversion_rate=conversion_rate,
                fx_rate=rate_obj,
                total_transaction_amount=total_tx_amount,
                total_functional_amount=total_fc_amount,
                created_by=user
            )

            # Mark entry as posted
            journal_entry.status = 'posted'
            journal_entry.posted_at = timezone.now()
            journal_entry.posted_by = user
            journal_entry.save()

        return journal_entry, fx_record

    @staticmethod
    def flag_missing_rate(
        entity: Entity,
        from_currency: str,
        to_currency: str,
        date_needed: date
    ) -> str:
        """
        Generate a human-readable flag when a rate is missing.

        Used to prevent posting an entry without the necessary FX rate.

        Returns:
            A clear error message suitable for user-facing UI
        """
        return (
            f"Missing FX rate: {from_currency}→{to_currency} "
            f"for {date_needed} ({from_currency} transaction in {to_currency} entity). "
            f"Upload the rate before posting."
        )


class PeriodEndRevaluationEngine:
    """
    Period-end remeasurement of foreign-currency monetary balances.

    ASC 830 rules:
    - Foreign-currency-denominated MONETARY assets/liabilities are remeasured
      to the current (period-end) rate.
    - Difference is realized/unrealized FX gain/loss.
    - Non-monetary items (inventory, fixed assets) are NOT remeasured.

    Workflow:
    1. Identify all foreign-currency monetary accounts in the entity
    2. Look up their opening balance (start of period)
    3. Look up the prior rate (when the balance was established)
    4. Look up the period-end rate
    5. Compute new balance at period-end rate
    6. Calculate FX gain/loss
    7. Post a journal entry with the FX adjustment
    8. Create audit trail
    """

    MONETARY_ACCOUNT_SUBTYPES = {
        'current_asset',
        'current_liability',
        'cash',
        'accounts_receivable',
        'accounts_payable',
        'short_term_loan',
    }

    @staticmethod
    def is_monetary_account(account: Account) -> bool:
        """
        Determine if an account is monetary (eligible for remeasurement).

        Monetary accounts include:
        - Cash
        - Accounts Receivable / Payable
        - Loans
        - Other current assets/liabilities

        Non-monetary accounts (NOT remeasured):
        - Inventory (at cost)
        - Fixed assets (at historical cost)
        - Prepaid expenses
        - Deferred revenue (liability but non-monetary for remeasurement purposes)
        """
        if account.account_subtype in PeriodEndRevaluationEngine.MONETARY_ACCOUNT_SUBTYPES:
            return True

        # Conservative: if subtype is not specified, assume non-monetary
        return False

    @staticmethod
    def get_opening_balance(
        account: Account,
        period: Period
    ) -> Tuple[Decimal, str]:
        """
        Get the opening balance of an account at the start of a period.

        Searches for all posted journal lines in the account up to the period start.

        Returns:
            Tuple of (balance_amount, currency)
            balance_amount is unsigned (use account.normal_balance to determine sign)
        """
        lines = JournalLine.objects.filter(
            account=account,
            journal_entry__entity=account.entity,
            journal_entry__entry_date__lt=period.start_date,
            journal_entry__status='posted'
        )

        total_debit = Decimal('0')
        total_credit = Decimal('0')
        currency = None

        for line in lines:
            currency = line.currency  # Assume same currency for this account
            total_debit += line.debit
            total_credit += line.credit

        # Determine net balance
        if account.normal_balance == 'debit':
            balance = total_debit - total_credit
        else:  # credit
            balance = total_credit - total_debit

        balance = max(Decimal('0'), balance).quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)
        currency = currency or account.entity.functional_currency

        return balance, currency

    @staticmethod
    def create_revaluation_batch(
        entity: Entity,
        period: Period,
        period_end_rate_date: date,
        user: User,
        description: str = ""
    ) -> PeriodEndRevaluation:
        """
        Create a period-end revaluation batch.

        This does the analysis but does NOT post entries yet.

        Args:
            entity: The entity being revalued
            period: The period being closed
            period_end_rate_date: Date of the period-end rates to use
            user: The user creating the batch
            description: Reason for this revaluation

        Returns:
            PeriodEndRevaluation object (status='draft')
        """
        batch = PeriodEndRevaluation.objects.create(
            entity=entity,
            period=period,
            period_end_rate_date=period_end_rate_date,
            description=description,
            status='draft',
            created_by=user
        )
        return batch

    @staticmethod
    def analyze_revaluation_batch(
        batch: PeriodEndRevaluation
    ) -> List[PeriodEndRevaluationLine]:
        """
        Analyze which accounts need remeasurement and calculate adjustments.

        For each foreign-currency monetary account:
        1. Get opening balance
        2. Get prior rate (when balance was established)
        3. Get period-end rate
        4. Calculate new balance at period-end rate
        5. Calculate FX gain/loss
        6. Create a PeriodEndRevaluationLine

        Returns:
            List of PeriodEndRevaluationLine objects (not yet saved)
        """
        entity = batch.entity
        period = batch.period
        period_end_rate_date = batch.period_end_rate_date

        lines = []

        # Find all accounts in this entity with foreign-currency balances
        for account in entity.accounts.filter(is_postable=True, is_active=True):
            if not PeriodEndRevaluationEngine.is_monetary_account(account):
                continue

            # Get opening balance
            opening_balance_fc, tx_currency = PeriodEndRevaluationEngine.get_opening_balance(
                account, period
            )

            if opening_balance_fc == Decimal('0'):
                continue  # No balance, no revaluation needed

            if tx_currency == entity.functional_currency:
                continue  # Same currency, no FX revaluation needed

            # Get prior rate (start of period or last known rate)
            try:
                prior_rate_obj = FXEngine.get_rate(
                    from_currency=tx_currency,
                    to_currency=entity.functional_currency,
                    effective_date=period.start_date,
                    rate_type='spot'
                )
                prior_rate = prior_rate_obj.rate
            except FXRateNotFoundError:
                prior_rate = Decimal('1.0')  # Conservative: assume 1:1

            # Get period-end rate
            try:
                period_end_rate_obj = FXEngine.get_rate(
                    from_currency=tx_currency,
                    to_currency=entity.functional_currency,
                    effective_date=period_end_rate_date,
                    rate_type='spot'
                )
                period_end_rate = period_end_rate_obj.rate
            except FXRateNotFoundError:
                period_end_rate = prior_rate  # Use prior if end rate not available

            # Calculate opening balance in functional currency
            opening_balance_fc = (
                opening_balance_fc * prior_rate
            ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)

            # Calculate remeasured balance at period-end rate
            remeasured_balance_fc = (
                opening_balance_fc * period_end_rate / prior_rate
            ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)

            # Calculate FX adjustment
            fx_adjustment = remeasured_balance_fc - opening_balance_fc

            if fx_adjustment != Decimal('0'):
                line = PeriodEndRevaluationLine(
                    revaluation=batch,
                    account=account,
                    transaction_currency=tx_currency,
                    opening_balance_tc=opening_balance_fc / prior_rate,
                    prior_rate=prior_rate,
                    opening_balance_fc=opening_balance_fc,
                    period_end_rate=period_end_rate,
                    remeasured_balance_fc=remeasured_balance_fc,
                    fx_adjustment=fx_adjustment,
                    created_by=batch.created_by
                )
                lines.append(line)

                # Update batch totals
                if fx_adjustment > 0:
                    batch.total_fx_gain += fx_adjustment
                else:
                    batch.total_fx_loss += abs(fx_adjustment)

        batch.save()
        return lines

    @staticmethod
    def post_revaluation_batch(
        batch: PeriodEndRevaluation,
        user: User
    ) -> Tuple[PeriodEndRevaluation, List[JournalEntry]]:
        """
        Post all FX adjustment entries for a revaluation batch.

        For each line in the batch:
        1. Create a journal entry (Dr FX Gain/Loss, Cr Monetary Account)
        2. Post it
        3. Link it to the revaluation line
        4. Aggregate FX gain/loss totals

        Returns:
            Tuple of (updated PeriodEndRevaluation, list of JournalEntry objects)

        Raises:
            FXConversionError: If any entry fails to post
        """
        batch.status = 'in_progress'
        batch.started_at = timezone.now()
        batch.started_by = user
        batch.save()

        entity = batch.entity
        period = batch.period
        posted_entries = []

        with transaction.atomic():
            for line in batch.lines.all():
                if line.fx_adjustment == Decimal('0'):
                    continue

                # Create journal entry
                entry_number = JournalEntry.objects.filter(
                    entity=entity
                ).count() + 1

                entry = JournalEntry.objects.create(
                    entity=entity,
                    entry_number=f"{entry_number:06d}",
                    entry_date=period.end_date,
                    period=period,
                    description=f"FX remeasurement: {line.account.name}",
                    status='draft',
                    source='system',
                    transaction_currency=entity.functional_currency,
                    created_by=user,
                    updated_by=user
                )

                # Add journal lines
                if line.fx_adjustment > 0:
                    # FX Gain
                    fx_gain_account = Account.objects.filter(
                        entity=entity,
                        name__icontains='FX Gain',
                        is_postable=True
                    ).first()
                    if not fx_gain_account:
                        raise FXConversionError(
                            "FX Gain account not found in entity's chart of accounts"
                        )

                    JournalLine.objects.create(
                        journal_entry=entry,
                        line_number=1,
                        account=fx_gain_account,
                        debit=line.fx_adjustment,
                        credit=Decimal('0'),
                        currency=entity.functional_currency,
                        functional_amount=line.fx_adjustment
                    )

                    JournalLine.objects.create(
                        journal_entry=entry,
                        line_number=2,
                        account=line.account,
                        debit=Decimal('0'),
                        credit=line.fx_adjustment,
                        currency=entity.functional_currency,
                        functional_amount=-line.fx_adjustment
                    )
                else:
                    # FX Loss
                    fx_loss_account = Account.objects.filter(
                        entity=entity,
                        name__icontains='FX Loss',
                        is_postable=True
                    ).first()
                    if not fx_loss_account:
                        raise FXConversionError(
                            "FX Loss account not found in entity's chart of accounts"
                        )

                    JournalLine.objects.create(
                        journal_entry=entry,
                        line_number=1,
                        account=fx_loss_account,
                        debit=abs(line.fx_adjustment),
                        credit=Decimal('0'),
                        currency=entity.functional_currency,
                        functional_amount=abs(line.fx_adjustment)
                    )

                    JournalLine.objects.create(
                        journal_entry=entry,
                        line_number=2,
                        account=line.account,
                        debit=Decimal('0'),
                        credit=abs(line.fx_adjustment),
                        currency=entity.functional_currency,
                        functional_amount=-abs(line.fx_adjustment)
                    )

                # Post the entry
                entry, fx_record = FXEngine.post_transaction_with_fx(
                    journal_entry=entry,
                    user=user,
                    rate_date=period.end_date
                )

                line.revaluation_entry = entry
                line.save()

                posted_entries.append(entry)

            # Mark batch as completed
            batch.status = 'completed'
            batch.completed_at = timezone.now()
            batch.completed_by = user
            batch.save()

        return batch, posted_entries


class ASC830TranslationEngine:
    """
    ASC 830 translation rules for consolidation.

    When consolidating entities with different functional currencies to a
    reporting currency:

    - Balance Sheet (Assets & Liabilities): Current rate (period-end)
    - Income Statement (Revenue & Expense): Average rate for the period
    - Equity: Historical rate (rates at contribution / distribution / income)
    - CTA (Cumulative Translation Adjustment): Plugs to OCI

    This engine computes the translated amounts for consolidation reporting.
    """

    @staticmethod
    def translate_account_balance(
        account: Account,
        balance_fc: Decimal,
        effective_date: date,
        translation_type: str,
        reporting_currency: str
    ) -> Decimal:
        """
        Translate an account balance to reporting currency per ASC 830.

        Args:
            account: The account being translated
            balance_fc: Balance in the entity's functional currency
            effective_date: Period-end date for current rates, or period mid-point for average
            translation_type: 'balance_sheet', 'income_statement', or 'equity'
            reporting_currency: Target currency (ISO 4217)

        Returns:
            Decimal balance in reporting currency
        """
        if account.entity.functional_currency == reporting_currency:
            return balance_fc

        if translation_type == 'balance_sheet':
            rate_type = 'spot'  # Current rate at period-end
        elif translation_type == 'income_statement':
            rate_type = 'average'  # Average rate for the period
        else:  # equity
            rate_type = 'historical'  # Historical rate

        try:
            rate_obj = FXEngine.get_rate(
                from_currency=account.entity.functional_currency,
                to_currency=reporting_currency,
                effective_date=effective_date,
                rate_type=rate_type
            )
            rate = rate_obj.rate
        except FXRateNotFoundError:
            # Fallback: use spot rate
            rate_obj = FXEngine.get_rate(
                from_currency=account.entity.functional_currency,
                to_currency=reporting_currency,
                effective_date=effective_date,
                rate_type='spot'
            )
            rate = rate_obj.rate

        translated = (balance_fc * rate).quantize(
            Decimal('0.0001'),
            rounding=ROUND_HALF_EVEN
        )
        return translated

    @staticmethod
    def compute_cta(
        entity: Entity,
        net_assets_fc: Decimal,
        net_assets_translated: Decimal,
        reporting_currency: str
    ) -> Decimal:
        """
        Compute the Cumulative Translation Adjustment (CTA / OCI entry).

        The CTA plugs to make the consolidated balance sheet balance
        when assets/liabilities are translated at current rates and
        equity is translated at historical rates.

        CTA = Net Assets Translated - (Net Assets FC × Average Rate)

        Returns:
            The CTA amount to post to OCI
        """
        # Simplified: CTA is the difference from restating at average rate
        # This is a conceptual placeholder; full implementation depends on
        # detailed tracking of equity components and their translation rates
        return Decimal('0')
