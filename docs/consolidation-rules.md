# Consolidation Rules & Examples

Authoritative source for multi-entity consolidation logic in the system.

## Overview

Consolidation is a **reporting-time operation** that combines financial information from multiple entities into a single set of consolidated financial statements. Key characteristics:

- **Entity books are source of truth** — never modified for consolidation
- **Consolidation layer is separate** — all adjustments, eliminations, and translations live here
- **Intercompany transactions must match** before consolidation completes
- **Every adjustment is auditable and reversible**
- **Multi-currency support** — per ASC 830 translation rules

## Consolidation Process

### Phase 1: Scope Validation

Before starting consolidation:

1. Identify the consolidated group (parent entity and owned downstream entities)
2. Verify the consolidation date (as_of_date)
3. Check that all entities have closed periods as of consolidation date
4. Confirm all entity accounts have consolidation mappings

**Blocking conditions:**
- Any entity in scope has an open period before as_of_date
- Parent entity has no ownership relationship with entities in scope
- Unmapped accounts exist (warnings, not blocking)
- Intercompany transactions are mismatched (blocking)

### Phase 2: Intercompany Matching

The system must identify and validate all intercompany transactions.

#### Matching Process

1. **Pair discovery:** Find entries that represent the same transaction across entities
   - By reference number (invoice #, check #)
   - By date and amount correlation
   - By explicit pairing_id links

2. **Validation:** For each pair, check:
   - Amounts match (within tolerance)
   - Currencies match
   - Dates are within 3 days of each other
   - Both entries are posted and in closed periods

3. **Status assignment:**
   - `matched`: All validations pass
   - `mismatched`: Amount, currency, or date divergence
   - `unmatched`: Counterparty entry not found
   - `resolved`: Mismatched but manually approved for consolidation

#### Tolerance Setting

Tolerance is configurable per entity pair. Default: **0% (exact match required)**.

Example:
- Sender: $1000.00
- Receiver: $999.99
- Tolerance: 0.1% of sender amount = $1.00
- Result: Matched (variance $0.01 < $1.00)

#### Example: Intercompany Sale

**OpCo 1 sells inventory to OpCo 2 for $10,000**

OpCo 1 (sender):
```
Dr Accounts Receivable (IC) $10,000
  Cr Sales Revenue (IC) $10,000
```

OpCo 2 (receiver):
```
Dr Cost of Goods Sold (IC) $10,000
  Cr Accounts Payable (IC) $10,000
```

Matching checks:
- Amounts: $10,000 = $10,000 ✓
- Currency: USD = USD ✓
- Date: Same day ✓
- Status: MATCHED

### Phase 3: Trial Balance Roll-Up

#### Account Mapping

Each entity account must map to exactly one consolidation account (effective-dated):

Example mapping:
```
OpCo 1 account 1010 (Cash)           → Consolidation account 1010 (Cash)
OpCo 1 account 2100 (AP)             → Consolidation account 2100 (AP)
OpCo 2 account 1010 (Cash)           → Consolidation account 1010 (Cash)
OpCo EU account 1010 (Cash - EUR)    → Consolidation account 1010 (Cash)
```

**Unmapped accounts:**
- Any entity account without a mapping surfaces as a UI warning
- Consolidation can proceed but excluded accounts won't appear in consolidated statements
- Common cause: New account created after consolidation mapping setup

#### Consolidation Algorithm

For each consolidation account:

```
consolidated_balance = 0

for each entity in scope:
    for each journal line in entity's trial balance (as of consolidation date):
        if line.account maps to this consolidation_account:
            # Translate to reporting currency
            translated_amount = translate(
                amount = line.functional_amount,
                from_currency = entity.functional_currency,
                to_currency = reporting_currency,
                account_type = line.account.type,
                as_of_date = consolidation_date
            )
            consolidated_balance += translated_amount

consolidation_accounts[acct].balance = consolidated_balance
```

#### Example: Consolidating Cash (USD reporting currency)

**As of 2024-12-31:**

| Entity   | Functional Currency | Cash Balance | Rate | Translated USD |
|----------|-------------------|--------------|------|-----------------|
| OpCo 1   | USD               | $500.00      | 1.00 | $500.00        |
| OpCo 2   | USD               | $300.00      | 1.00 | $300.00        |
| OpCo EU  | EUR               | €100.00      | 1.10 | $110.00        |
| **Total** |                   |              |      | **$910.00**    |

Consolidated cash = $910.00

### Phase 4: Currency Translation (ASC 830)

Consolidation requires translating entity financial statements from their functional currencies to the reporting currency.

#### Translation Rules

**Balance Sheet items (as of period end):**
- Current rate method (period-end rate)

Example:
```
OpCo EU (functional EUR) has €100 of equipment
Period-end rate: 1 EUR = $1.10
Consolidated: $110
```

**Income Statement items (averaging the period):**
- Average rate (weighted average of daily rates for the period)

Example:
```
OpCo EU revenue: €50,000
Average rate for period: 1 EUR = $1.08
Consolidated: $54,000
```

**Equity items (historical rate):**
- Rate at which equity contribution was made

Example:
```
OpCo EU capital contribution: €100,000 at historical rate 1 EUR = $1.05
Consolidated: $105,000 (locked, not updated for current rates)
```

**Translation Adjustment (CTA — Cumulative Translation Adjustment):**

The difference between:
- Sum of translated assets/liabilities (at current rate)
- Sum of translated equity (at historical rate)

Flows to Other Comprehensive Income (OCI) on the consolidated balance sheet.

#### Example: Full Translation

**OpCo EU Balance Sheet (2024-12-31), Functional Currency EUR:**

| Account             | EUR Amount | Rate | USD Amount |
|-------------------|-----------|------|-----------|
| **Assets**        |           |      |           |
| Cash              | €100      | 1.10 | $110      |
| Equipment         | €500      | 1.10 | $550      |
| Total Assets      | €600      | 1.10 | $660      |
| **Liabilities**   |           |      |           |
| Payables          | €200      | 1.10 | $220      |
| Total Liab        | €200      | 1.10 | $220      |
| **Equity**        |           |      |           |
| Capital Stock     | €300      | 1.05 | $315      |
| Retained Earnings | €100      | (avg) | $108     |
| Total Equity      | €400      |      | $423      |
| **CTA (plug)**    | —         |      | $17       |
| Total Liab + Eq   | €400      |      | $440      |

CTA = $660 − $440 = $220 (simplified; actual calc per ASC 830)

### Phase 5: Elimination Adjustments

#### Types of Eliminations

**1. Intercompany Receivables / Payables**

Eliminate matching AR and AP accounts across entities.

Example:
```
OpCo 1: Dr AR (IC) $10,000, Cr Revenue (IC) $10,000
OpCo 2: Dr Expense (IC) $10,000, Cr AP (IC) $10,000

Elimination:
Dr AP (IC) (OpCo 2) $10,000
  Cr AR (IC) (OpCo 1) $10,000
```

Result: AR and AP both zeroed out at consolidation level.

**2. Intercompany Revenue / Expense**

Eliminate matched revenue/expense between entities.

Example:
```
OpCo 1 IC Revenue: $10,000
OpCo 2 IC Expense: $10,000

Elimination:
Dr Revenue (IC) (OpCo 1) $10,000
  Cr Expense (IC) (OpCo 2) $10,000
```

Result: Consolidated as if the transaction never happened (intra-group).

**3. Intercompany Investments**

Eliminate parent's investment in subsidiary against subsidiary's equity.

Example:
```
Parent balance sheet: Investment in Sub $1,000,000
Sub balance sheet: Capital Stock $1,000,000

Elimination:
Dr Equity (Sub) $1,000,000
  Cr Investment (Parent) $1,000,000
```

Result: Investment account eliminated; consolidated balance sheet shows only operating assets.

**4. Unrealized Profit in IC Inventory**

If entity A sells inventory to entity B at a markup, any units unsold by period-end contain unrealized profit. Must be deferred until sold externally.

Example:
```
OpCo 1 sells inventory to OpCo 2:
- Cost to OpCo 1: $100/unit
- Sale price: $150/unit
- OpCo 2 purchases 100 units, sells 80 externally

Unrealized profit = 20 units × ($150 − $100) markup = $1,000

Elimination:
Dr Cost of Goods Sold (OpCo 1) $1,000
  Cr Inventory (OpCo 2) $1,000
```

Result: Consolidated inventory is written down; profit deferred to period of external sale.

#### Elimination Entry Structure

All eliminations live on the consolidation layer (not in entity books).

```
ConsolidationAdjustment:
  adjustment_type: ELIMINATION
  description: "Eliminate IC AR/AP between OpCo 1 and OpCo 2"
  intercompany_transaction_id: <IC ID>
  status: DRAFT → APPLIED
  
  ConsolidationAdjustmentLine:
    consolidation_account: 2100 (AP - Consolidation)
    debit: $10,000
  ConsolidationAdjustmentLine:
    consolidation_account: 1200 (AR - Consolidation)
    credit: $10,000
```

### Phase 6: Minority Interest (Non-Controlling Interest)

For partially-owned subsidiaries (e.g., parent owns 75%, minority owns 25%):

1. **Consolidate 100%** of subsidiary's assets, liabilities, revenue, expense
2. **Allocate proportional share** of net assets and net income to minority interest

**Example:**

Parent owns 75% of Sub, minority owns 25%.
Sub net income = $1,000,000

In consolidated income statement:
```
Net Income (before NCI allocation)         $1,000,000
Less: Minority Interest (25% × $1,000,000) ($250,000)
Net Income (attributable to parent)         $750,000
```

In consolidated balance sheet:
```
Total Equity              $4,000,000
Less: Minority Interest   ($1,000,000)  [25% of sub equity]
Parent Equity             $3,000,000
```

## Sub-Consolidation (Pyramid Structures)

When entities own entities own entities:

```
Parent Corp
  ├─ OpCo 1
  ├─ OpCo 2
  └─ Holdco A
      ├─ OpCo 3
      └─ OpCo 4
```

Consolidation can be done at multiple levels:

1. **Full consolidation:** All entities to Parent Corp reporting
2. **Sub-consolidation:** Holdco A's financials consolidated (OpCo 3 + OpCo 4) separately

Process is identical at each level:
- Match IC transactions at that level
- Roll up trial balances
- Apply translations
- Create eliminations

Results flow up to parent consolidation.

## Mismatch Resolution

### Detecting Mismatches

System automatically flags:
- Amount variance exceeding tolerance
- Currency mismatch
- Date divergence > 3 days
- Unpaired entries (one side has no counterparty)

### Resolution Options

**1. Correct the source:**
- Adjust entry in sender or receiver entity
- Post reversal + corrected entry
- Re-run matching

**2. Approve variance:**
- Override mismatch status to RESOLVED
- Provide explanation (e.g., "Rounding difference approved")
- Create elimination as-is with best-fit amounts

**3. Exclude from consolidation:**
- Mark transaction as EXCLUDED
- Document reason in audit trail
- Proceed with consolidation without this IC pair

## Audit Trail

Every consolidation action is logged:

```
AuditLog entry:
- actor: user who initiated
- table: consolidation_adjustments
- record_id: adjustment ID
- action: INSERT / UPDATE
- before_state: null (for INSERT)
- after_state: {adjustment_type, description, status, ...}
- reason: "Manual elimination creation during consolidation run"
- occurred_at: timestamp

Plus related logs for:
- IntercompanyTransaction status changes
- ConsolidationRun state transitions
- Entity accounts added/mapped
```

All audit entries are **immutable** (append-only log).

## Examples by Scenario

### Example 1: Simple Two-Entity Consolidation (Same Currency)

**Setup:**
- Parent Corp (USD reporting)
- OpCo 1 (USD functional)
- OpCo 2 (USD functional)
- Parent owns 100% of both

**Entries:**

OpCo 1 (2024-12-31):
```
Cash           $500
AR (external)  $200
Revenue        ($700)
Equity         ($0) [balances]
```

OpCo 2 (2024-12-31):
```
Cash           $300
AP (to OpCo 1) ($100)  [IC payable]
Expense        $100    [IC expense]
Equity         ($300)
```

OpCo 1 (2024-12-31):
```
AR (IC OpCo 2)  $100   [intercompany receivable]
Revenue (IC)    ($100) [intercompany sale]
```

**Matching:**
- OpCo 1 AR (IC) $100 ↔ OpCo 2 AP (IC) $100 → MATCHED

**Consolidation (before eliminations):**
```
Cash           = $500 + $300 = $800
AR (external)  = $200
AR (IC)        = $100
AP (IC)        = ($100)
Revenue        = ($700) + ($100) = ($800)
Expense        = $100
Equity         = ($300)
```

**Eliminations:**
```
Dr AP (IC)      $100
  Cr AR (IC)    $100
Dr Revenue (IC) $100
  Cr Expense    $100
```

**Consolidated (after eliminations):**
```
Cash           = $800
AR (external)  = $200
Revenue        = ($700)
Equity         = ($300)

Check: $1,000 assets = $700 liabilities = $300 equity ✓
```

### Example 2: Multi-Currency Consolidation with Translation

**Setup:**
- Parent Corp (USD reporting)
- OpCo US (USD functional, USD reporting)
- OpCo EU (EUR functional, EUR reporting)
- Parent owns 100% of both

**Period-end rates (2024-12-31):**
- EUR/USD spot: 1 EUR = 1.10 USD
- EUR/USD average (2024): 1 EUR = 1.08 USD
- EUR/USD historical (date of capital contribution): 1 EUR = 1.05 USD

**OpCo EU Trial Balance (functional EUR):**
```
Assets
  Cash             €100
  Equipment        €500
Total Assets       €600

Liabilities
  Payables         €200
Total Liabilities  €200

Equity
  Capital (historical) €300
  Retained Earnings    €100
Total Equity       €400
```

**Translation:**

Assets (current rate):
```
Cash          €100 × 1.10 = $110
Equipment     €500 × 1.10 = $550
Total         €600         = $660
```

Liabilities (current rate):
```
Payables      €200 × 1.10 = $220
```

Equity (split by component):
```
Capital       €300 × 1.05 (historical) = $315
Retained Earn €100 × 1.08 (average)    = $108
Total Equity                            = $423
```

CTA (plug, to OCI):
```
Total Assets          $660
Total Liab + Equity   $220 + $315 + $108 + CTA = $660
Therefore: CTA = $660 − $643 = $17
```

**Consolidated (OpCo EU portion):**
```
Cash             $110
Equipment        $550
Payables         ($220)
Capital (equity) ($315)
Accumulated OCI (CTA) ($17)
Retained Earnings    ($108)
```

## Blocking Conditions (Consolidation Cannot Proceed)

1. **Open periods:** Any entity in scope has period status = 'open' before as_of_date
2. **Unresolved IC mismatches:** Any intercompany transaction with status = 'mismatched' and not marked as manually RESOLVED
3. **Missing parent relationship:** Parent entity has no ownership link to entities in scope
4. **Missing consolidation mappings:** (Warning, not blocking in v1; consolidated output just excludes unmapped accounts)

## Reversals & Corrections

If a consolidation adjustment is found to be incorrect:

1. Create **reversal adjustment** (new ConsolidationAdjustment with opposite debit/credits)
2. Link original adjustment: `original_adjustment.reversed_by_adjustment_id = reversal.id`
3. Mark original: `original_adjustment.status = 'reversed'`
4. Both entries appear in consolidated trial balance (they offset)
5. Audit trail captures full history

Example:
```
Original Elimination (incorrect):
  Dr AP (IC)       $100
    Cr AR (IC)     $100

Reversal Elimination:
  Dr AR (IC)       $100
    Cr AP (IC)     $100

Net effect in consolidated TB: AR = $100 − $100 = $0 (reversed)
Audit trail shows: Original created by [user], then reversed by [user] with reason "Incorrect intercompany amount"
```

## Testing & Validation

Consolidation output is validated:

1. **Balance check:** All consolidated trial balance debit/credit balances per account type (assets = liabilities + equity)
2. **Mapping completeness:** Warn if material unmapped accounts exist
3. **IC matching:** Report any unresolved mismatches
4. **CTA reasonableness:** Flag CTA > 5% of equity as potential error
5. **Audit trail completeness:** Every adjustment has created_by, created_at, and reason logged

## Known Limitations (v1)

- Does not calculate minority interest automatically (manual entry for now)
- Intercompany inventory profit deferral is manual (not automated)
- Period-end translation average rate requires manual upload (not auto-computed)
- No equity roll-forward cascade (historical rates must be tracked separately)

These features are Phase 2 enhancements.

## See Also

- `docs/accounting-rules.md` — Consolidation rules section
- `docs/data-model.md` — Consolidation models
- `apps/finance/consolidation_engine.py` — Implementation
- `apps/finance/tests/test_consolidation.py` — Test suite
