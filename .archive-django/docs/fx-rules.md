# FX Handling Rules & ASC 830 Translation

**Source of truth for multi-currency FX handling in the system.**

This document specifies how the system handles currency conversion, remeasurement, and consolidation translation. When uncertain, consult this document first.

---

## Fundamental Principles

### Three Currency Concepts

1. **Transaction Currency**: The currency in which a transaction is recorded at origination.
   - Example: An invoice from a German supplier in EUR.

2. **Functional Currency**: The currency in which an entity conducts most of its business and prepares its statutory financial statements.
   - Example: A US subsidiary's functional currency is USD; a Spanish subsidiary's is EUR.
   - Defined per entity in the `Entity.functional_currency` field.
   - Never changes retroactively (change requires restatement).

3. **Reporting Currency**: The currency used for consolidated group financial statements.
   - Example: A USD holding company consolidates subsidiaries in EUR, GBP, JPY.
   - Specified per consolidation run.
   - All translated balances are expressed in the reporting currency.

### The FX Rate Rule

**Critical**: Use the FX rate effective on the **transaction date**, not today's rate.

- A transaction dated 2024-01-15 is converted using the rate effective 2024-01-15.
- If the rate for the exact date is unavailable, use the most recent rate on or before that date.
- Never use today's rate (or any future rate) for a historical transaction.
- This ensures consistency: the same transaction always converts to the same functional amount, regardless of when it's posted or reviewed.

### Decimal Precision

- All FX rates: `numeric(18, 8)` in the database (18 digits, 8 decimal places).
- All conversions use `Decimal` in Python with `ROUND_HALF_EVEN` (banker's rounding).
- All monetary amounts: `numeric(20, 4)` (20 digits, 4 decimal places).
- Decimal context: 28 significant figures, rounding = ROUND_HALF_EVEN.

Example:
```python
from decimal import Decimal, getcontext, ROUND_HALF_EVEN
getcontext().prec = 28
getcontext().rounding = ROUND_HALF_EVEN

# 100 USD at 0.92 USD/EUR = 92 EUR
amount = Decimal('100.0000')
rate = Decimal('0.92000000')
converted = (amount * rate).quantize(Decimal('0.0001'), rounding=ROUND_HALF_EVEN)
# Result: Decimal('92.0000')
```

---

## Transaction-Level FX Handling

### On Transaction Posting

When a journal entry is posted:

1. **Check entry balances in transaction currency**.
   - Sum(debits) = Sum(credits) in transaction_currency
   - Enforced at the database level (Postgres trigger).

2. **Look up FX rate for transaction date**.
   - If transaction_currency == entity.functional_currency, rate = 1.0 (no conversion).
   - Otherwise, look up the FXRate effective on entry_date.
   - If not found, raise `FXRateNotFoundError` — do NOT post without the rate.

3. **Convert each journal line to functional currency**.
   - For each line: `functional_amount = transaction_amount * fx_rate`.
   - Sign it: positive for debit, negative for credit.
   - Round to 4 decimal places using ROUND_HALF_EVEN.

4. **Validate functional currency balance**.
   - Sum(functional_amounts, all lines) must = 0.
   - If not, raise `FXConversionError`.

5. **Create a TransactionFX record**.
   - Link to the journal entry.
   - Store: transaction_currency, functional_currency, conversion_rate, fx_rate_id.
   - Store: total_transaction_amount, total_functional_amount.
   - is_remeasurement = False (not a period-end entry).

6. **Mark entry as posted**.
   - status = 'posted'
   - posted_at = now()
   - posted_by = user

Example: EUR invoice in a USD entity

```
Entry date: 2024-01-15
Transaction currency: EUR
Entity functional currency: USD

FX Rate lookup: 1 EUR = 1.10 USD on 2024-01-15

Journal Entry:
  Line 1: Dr Accounts Receivable  1000.00 EUR  → 1100.0000 USD
  Line 2: Cr Sales Revenue        1000.00 EUR  → -1100.0000 USD

TransactionFX:
  conversion_rate: 1.10
  total_transaction_amount: 1000.0000
  total_functional_amount: 1100.0000
```

---

## Period-End Remeasurement (ASC 830)

### Concept

At the end of each accounting period, foreign-currency-denominated **monetary** assets and liabilities are remeasured to the current rate. The gain or loss is posted as a separate journal entry.

### Scope: Monetary vs. Non-Monetary

**Monetary** accounts (remeasured):
- Cash, bank accounts
- Accounts receivable / payable
- Loans (short and long-term)
- Current assets and current liabilities
- Any account subtype in: `current_asset`, `current_liability`, `cash`, `accounts_receivable`, `accounts_payable`, `short_term_loan`

**Non-monetary** accounts (NOT remeasured):
- Inventory (held at historical cost)
- Fixed assets (held at historical cost)
- Prepaid expenses
- Deferred revenue (liability, but non-monetary for remeasurement)
- Accumulated depreciation

### Workflow

1. **Identify the period and entities**.
   - Which entity is being closed?
   - Which period?

2. **For each foreign-currency monetary account**:

   a. Get opening balance (accumulated through period start).
   ```
   opening_balance_tc = sum of all journal lines in account through period start, in TC
   ```

   b. Get prior period-end rate (rate effective at prior period end).
   ```
   prior_rate = FXRate(TC→FC, effective on period start)
   ```

   c. Calculate opening balance in functional currency.
   ```
   opening_balance_fc = opening_balance_tc * prior_rate
   ```

   d. Get period-end rate (rate effective on period end).
   ```
   period_end_rate = FXRate(TC→FC, effective on period end)
   ```

   e. Remeasure balance at period-end rate.
   ```
   remeasured_balance_fc = opening_balance_tc * period_end_rate
   ```

   f. Calculate FX adjustment.
   ```
   fx_adjustment = remeasured_balance_fc - opening_balance_fc
   ```

   g. If adjustment != 0, create a PeriodEndRevaluationLine.

3. **Post FX adjustment entries**.

   For each line with a non-zero adjustment:

   - If adjustment > 0 (gain):
     ```
     Dr FX Gain                fx_adjustment
     Cr Monetary Account       fx_adjustment
     ```

   - If adjustment < 0 (loss):
     ```
     Dr FX Loss                |fx_adjustment|
     Cr Monetary Account       |fx_adjustment|
     ```

   - Entry date = period end date.
   - Entry source = 'system'.
   - Transaction currency = functional currency (no further FX conversion).
   - Create TransactionFX record with is_remeasurement = True.

4. **Update PeriodEndRevaluation batch**.
   - Accumulate total_fx_gain and total_fx_loss.
   - Set status to 'completed'.
   - Record completed_at and completed_by.

### Example: EUR Receivable in USD Entity

```
Period: January 2024 (2024-01-01 to 2024-01-31)
Entity: US OpCo (functional currency USD)
Account: Accounts Receivable (foreign currency EUR)

Transactions in January:
  2024-01-15: Dr AR 1000 EUR / Cr Revenue (rate: 1 EUR = 1.10 USD)
    → Opening balance: 1000 EUR = 1100 USD

Prior period (December 2023) end rate: 1 EUR = 1.08 USD
Current period (January 2024) end rate: 1 EUR = 1.12 USD

Remeasurement calculation:
  opening_balance_tc = 1000 EUR
  opening_balance_fc = 1000 * 1.10 = 1100 USD
  remeasured_balance_fc = 1000 * 1.12 = 1120 USD
  fx_adjustment = 1120 - 1100 = +20 USD (gain)

Entry posted on 2024-01-31:
  Dr FX Gain        20.00 USD
  Cr Accounts Receivable  20.00 USD
  (Accounts Receivable balance: 1000 EUR = 1120 USD)
```

---

## Consolidation Translation (ASC 830)

### When Translation Happens

Consolidation is a reporting-time operation. Individual entity books are **never** translated. Instead, on each consolidation run:

1. Pull entity trial balances as of the consolidation date.
2. Translate each entity's balances to the reporting currency using ASC 830 rules.
3. Aggregate through consolidation mappings.
4. Post consolidation-layer adjustments (eliminations, etc.).

### Translation Rules

For each account in an entity:

| Concept | Translation Rate | When Used |
|---|---|---|
| **Assets & Liabilities** | Current rate | Period-end (balance sheet date) |
| **Revenue & Expenses** | Average rate | Average of daily spot rates during the period |
| **Equity** | Historical rate | Rate effective when the equity was established (not used for translation in this phase) |
| **CTA** | Calculated | Plug to OCI to balance the consolidated BS |

### Current Rate Method (Full Consolidation)

The system uses the **current rate method** (all assets/liabilities translate at current rate; income/expense at average rate).

1. **Balance Sheet Translation**:
   - All assets: translated at current rate
   - All liabilities: translated at current rate
   - Equity: historical rate (or parent's contribution rate)

2. **Income Statement Translation**:
   - All revenue: translated at average rate for the period
   - All expense: translated at average rate for the period

3. **Cumulative Translation Adjustment (CTA)**:
   - The difference between translating equity at historical vs. current rates plugs to OCI.
   - CTA flows in/out with each period's translation adjustment.

### Example: Consolidating a EUR Subsidiary into USD Reporting

```
Subsidiary Trial Balance (EUR), as of 2024-01-31:
  Cash: 100 EUR
  Accounts Receivable: 500 EUR
  Fixed Assets: 1000 EUR
  Accounts Payable: 200 EUR
  Revenue (Jan): 600 EUR
  Expense (Jan): 400 EUR

Rates:
  Period-end (current) rate: 1 EUR = 1.12 USD
  Average rate for January: 1 EUR = 1.10 USD
  Historical rate (subsidiary inception): 1 EUR = 1.00 USD

Translated Trial Balance (USD):
  Cash: 100 * 1.12 = 112 USD (current rate, asset)
  AR: 500 * 1.12 = 560 USD (current rate, asset)
  Fixed Assets: 1000 * 1.12 = 1120 USD (current rate, asset)
  AP: 200 * 1.12 = 224 USD (current rate, liability)
  Revenue: 600 * 1.10 = 660 USD (average rate, income stmt)
  Expense: 400 * 1.10 = 440 USD (average rate, income stmt)

CTA = (Assets_translated - Liabilities_translated) - (Assets_translated - Liabilities_translated at historical)
    = adjustment to OCI
```

---

## FX Rate Management

### Storage & Lookup

- **Table**: `fx_rates`
- **Key**: `(from_currency, to_currency, effective_date, rate_type)` unique
- **Convention**: Store both directions (USD→EUR and EUR→USD) to simplify lookups.

### Rate Types

| Type | Use | Example |
|---|---|---|
| `spot` | Transaction postings; period-end remeasurement (current rate) | Daily market rate |
| `average` | Income statement translation during consolidation | Arithmetic mean of daily spot rates |
| `closing` | Alternative to spot (some jurisdictions use closing rates) | Rate at market close |

### Lookup Logic

```python
FXEngine.get_rate(from_currency, to_currency, effective_date, rate_type='spot')
```

1. Try exact match: `(from_currency, to_currency, effective_date, rate_type)`
2. If not found, try most recent on or before date: `(from_currency, to_currency, effective_date <= given_date, rate_type)`
3. If not found, try inverse direction: `(to_currency, from_currency, effective_date <= given_date, rate_type)`
4. If still not found, raise `FXRateNotFoundError`

### What If a Rate Is Missing?

**Do not post or remeasure without the required rate.**

1. Flag the error to the user: `FXEngine.flag_missing_rate(entity, from, to, date)`
2. User uploads the missing rate(s).
3. Retry posting/remeasurement.

---

## Audit Trail

Every FX operation is audit-logged:

1. **TransactionFX creation** on entry posting.
   - Who posted? When?
   - What rate was used? From which source?

2. **PeriodEndRevaluationLine creation**.
   - Which account was remeasured?
   - What was the opening balance? The closing balance?
   - What FX gain/loss was recognized?

3. **JournalEntry creation** for FX adjustment entries.
   - Entry source = 'system'
   - Description = "FX remeasurement: {account_name}"

4. **PeriodEndRevaluation status changes**.
   - Who started the batch? When?
   - Who completed it? When?
   - If rolled back, why?

---

## Data Validation & Constraints

### On Entry Posting

- [ ] Entry has ≥2 lines
- [ ] Sum(debits) == Sum(credits) in transaction_currency (DB trigger)
- [ ] Sum(functional_amounts) == 0 in functional_currency (application check)
- [ ] FX rate exists for transaction_currency → functional_currency on entry_date
- [ ] All accounts are active and postable
- [ ] All accounts belong to the entry's entity
- [ ] Period is open

### On Period-End Remeasurement

- [ ] Period is about to close (status 'open')
- [ ] Period-end date is defined
- [ ] FX rates exist for all foreign currencies in the entity on the period-end date
- [ ] Monetary accounts are identified correctly
- [ ] FX gain/loss accounts exist in the entity's CoA
- [ ] All remeasurement entries balance in both transaction and functional currency

---

## Common Scenarios & Examples

### Scenario 1: Multi-Currency Invoice → Payment

A USD entity receives an EUR invoice on 2024-01-15, pays it on 2024-02-05.

**Invoice posting (2024-01-15)**:
```
EUR/USD rate on 2024-01-15: 1.10
Invoice amount: 1000 EUR

Dr Accounts Receivable    1000.00 EUR    → 1100.0000 USD
Cr Vendor Payable        1000.00 EUR    → -1100.0000 USD
```

**Payment (2024-02-05)**:
```
EUR/USD rate on 2024-02-05: 1.12
Payment: 1000 EUR ≈ 1120 USD (need 20 more)

Dr Vendor Payable       1000.00 EUR    → 1120.0000 USD
Cr Cash                1000.00 EUR    → -1120.0000 USD

And:
Dr FX Loss              20.00 USD (the extra 20 we had to pay)
Cr Cash                20.00 USD
```

### Scenario 2: Period-End Remeasurement

At the end of January 2024, a USD entity has an outstanding 500 EUR receivable.

**Rates**:
- Rate on 2024-01-15 (when invoice was issued): 1.10 USD/EUR
- Rate on 2024-01-31 (period end): 1.12 USD/EUR

**Opening balance**: 500 EUR = 550 USD (1.10 rate)
**Remeasured balance**: 500 EUR = 560 USD (1.12 rate)
**FX gain**: 10 USD

**Entry posted 2024-01-31**:
```
Dr Accounts Receivable      10.00 USD
Cr FX Gain                 10.00 USD
```

### Scenario 3: Consolidating Multi-Currency Entities

Parent (USA) owns:
- Spain OpCo (EUR)
- Japan OpCo (JPY)
- Canada OpCo (CAD)

**Consolidation as of 2024-01-31, reporting in USD**:

1. Pull trial balances as of 2024-01-31.
2. For each subsidiary:
   - Translate assets/liabilities at current rate (2024-01-31)
   - Translate income/expense at average rate (January average)
   - Calculate CTA plug
3. Aggregate through consolidation mappings.
4. Post eliminations (intercompany sales, investments, etc.).

---

## Error Messages & Recovery

| Error | Cause | Recovery |
|---|---|---|
| `FXRateNotFoundError` | No rate for (from, to, date, type) | Upload the missing rate(s) and retry |
| `FXConversionError` | Entry doesn't balance in functional currency | Check rates; verify amounts; recompute |
| `Entry doesn't balance in transaction currency` | Debit != Credit in transaction currency | Fix journal lines; rebalance before posting |
| `Period-end rate missing for remeasurement` | No rate on period-end date | Upload period-end rates before revaluation |

---

## Testing & Precision

All FX logic is tested with:

1. **200+ test cases** covering:
   - Exact rate lookups
   - Rate fallbacks (most recent prior rate)
   - Conversion rounding (ROUND_HALF_EVEN)
   - Multi-currency entry posting
   - Period-end remeasurement
   - ASC 830 translation

2. **5+ currency pairs**: USD, EUR, GBP, JPY, MXN, CAD

3. **Edge cases**:
   - Missing rates (flagged, no posting)
   - Zero amounts (convert to zero)
   - Same currency (rate = 1.0)
   - Small/large amounts (precision maintained)
   - Rounding (banker's rounding applied consistently)

4. **Property-based tests** (hypothesis):
   - For any amount and rate, conversion result is a valid Decimal with 4 places
   - Debit/credit amounts always balance in journal entries

---

## References

- **ASC 830**: Foreign Currency Matters
  - Balance sheet: current rate method
  - Income statement: average rate
  - Equity: historical rate
  - CTA to OCI

- **Django Decimal Field**: 18-digit, 4-decimal storage

- **Postgres numeric(18,8)**: High-precision FX rate storage

- **Python Decimal module**: Context precision 28, rounding ROUND_HALF_EVEN
