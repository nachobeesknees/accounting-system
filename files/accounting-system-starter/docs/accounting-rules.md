# Accounting Rules

Authoritative source for business rules the system enforces. When Claude Code is uncertain about an accounting rule, the answer must be here. If not, STOP and ask.

## Double-entry fundamentals

- Every transaction has ≥2 journal lines.
- Total debits equal total credits, exactly, in the entry's transaction currency.
- Debits increase assets/expenses; decrease liabilities/equity/revenue.
- Credits increase liabilities/equity/revenue; decrease assets/expenses.

## Posting rules

- Journal entry is `draft` until explicitly posted.
- Posting requires: entry balances in transaction currency AND in functional currency; period is open; all accounts are postable, active, and belong to the entry's entity; ≥2 lines.
- After posting, entry is immutable. Changes via reversal only.

## Reversal rules

- Reversal entry is a new entry that reverses debits/credits of the original.
- References original via `reverses_entry_id`.
- Original is marked `reversed`, references reversal via `reversed_by_entry_id`.
- Reversal must be posted to an open period.
- Reversal can itself be reversed.

## Period close

For each entity:

1. All draft entries dated in the period are posted or moved.
2. Accruals and adjusting entries posted.
3. Bank/card reconciliations complete.
4. FX remeasurement of foreign-currency-denominated monetary balances posted.
5. Trial balance generated and reviewed.
6. Period status: `open` to `closed`.
7. Trial balance snapshot stored.

After close, no new postings without reopening (audit-trailed). Locking is the stronger step (permanent).

## Fiscal year close

Per entity, at its fiscal year-end:

1. Monthly close completed.
2. Revenue accounts zeroed to retained earnings via closing entry.
3. Expense accounts zeroed to retained earnings via closing entry.
4. Net income reflected in retained earnings.
5. Fiscal year locked.

## Multi-currency rules (ASC 830 applied)

### Transactions

- Transaction in a currency other than the entity's functional currency:
  - Record at transaction currency at posting time
  - Translate to functional currency at the FX rate effective on the entry date (typically previous day's close)
  - `functional_amount` is stored signed; the entry must balance in both transaction AND functional currency

### Period-end remeasurement (monetary balances)

- Monetary assets/liabilities denominated in non-functional currencies are remeasured to current rate at period-end.
- Difference posted as Dr/Cr Unrealized FX Gain/Loss, Cr/Dr the monetary balance account.
- Non-monetary balances (inventory at cost, fixed assets) are NOT remeasured.

### Translation for consolidation

When consolidating entities with different functional currencies to the reporting currency:

- Assets/liabilities at current rate (period-end)
- Income/expense at average rate for the period
- Equity at historical rate (rates effective at each contribution / distribution / income event)
- Translation adjustment (CTA) plugs to OCI (Cumulative Translation Adjustment) on the balance sheet

### Rate selection

- Default rate type for transactions: `spot` on the entry date
- Average rates used for translation of income statements: computed as the average of daily spot rates for the period
- Historical rates for equity: stored with the equity transactions themselves

## Consolidation rules

Consolidation is a reporting-time operation. Eliminations and translations live in the **consolidation layer**, not in entity books.

### Process

1. Pick consolidation `as_of_date` and reporting currency.
2. Identify entities in scope (the parent and its owned downstream entities).
3. For each entity, pull its trial balance as of the nearest closed period to `as_of_date` (within 93 days, per common GAAP convention).
4. Translate each entity's TB to reporting currency per the rules above.
5. Sum entity TBs through the consolidation mapping (entity accounts → consolidation accounts).
6. Apply intercompany eliminations.
7. Apply basis-normalization adjustments (e.g., reverse deferred revenue from entities tracking it for audit but not for group reporting).
8. Apply minority interest / non-controlling interest entries for partially-owned subsidiaries.
9. Produce consolidated financial statements.

### Eliminations

- Intercompany receivables / payables: eliminate matching balances.
- Intercompany revenue / expense: eliminate matching activity.
- Intercompany investments (parent's investment in sub) eliminated against subsidiary equity.
- Unrealized profit in intercompany inventory transfers: defer until sold externally (if material).

### Mismatch handling

- Intercompany entries should be paired via `intercompany_pair_id` at posting time.
- Pre-consolidation report lists unmatched intercompany entries for resolution.
- Mismatches block consolidation until resolved.
- Small variance tolerance: TBD per Phase 0 open question.

### Non-controlling interest (NCI)

- For partially-owned subsidiaries: consolidate 100% of assets/liabilities/income/expense.
- Allocate proportional share of net assets and net income to NCI on the consolidated balance sheet and income statement.

## Accruals (for entities tracking them)

Standard patterns:

- Accrued expenses: Dr Expense, Cr Accrued Liability
- Prepaid expenses amortization: Dr Expense, Cr Prepaid Asset (over benefit period)
- Depreciation: Dr Depreciation Expense, Cr Accumulated Depreciation
- Deferred revenue (only for entities with `tracks_deferred_revenue` flag): Dr Cash/AR, Cr Deferred Revenue at receipt; Dr Deferred Revenue, Cr Revenue as earned
- Accrued revenue: Dr Receivable, Cr Revenue

Reversal policy (open question, decide at Phase 1): some accruals reverse at start of next period (manual entries simpler) vs. carry forward and adjust (more complex but more accurate). Per-entity per-account configuration possible.

## AP rules

- Receive bill: Dr Expense (or Asset), Cr Accounts Payable. In transaction currency.
- Bill must be approved before payment.
- Pay bill: Dr Accounts Payable, Cr Cash.
- Partial payments tracked; AP balance reflects remaining liability.
- FX on AP balances at period-end: remeasure to functional currency at current rate.
- Voiding paid bill: reverse the payment and the bill.

## AR rules

- Issue invoice: Dr Accounts Receivable, Cr Revenue.
- Receive payment: Dr Cash, Cr Accounts Receivable.
- Bad debt write-off: Dr Bad Debt Expense (or Allowance), Cr Accounts Receivable.
- FX remeasurement same as AP.

## Bank reconciliation rules

- Every bank account has a corresponding GL cash (or card liability) account.
- Reconciliation matches statement balance to book balance for the GL account.
- Outstanding items (deposits in transit, outstanding checks, pending card transactions) explain difference.
- Reconciliation complete when book + outstanding = statement, all differences explained.
- Completed reconciliation locks matched transactions from modification.

## Fixed asset rules

- Acquisition: Dr Fixed Asset, Cr Cash (or Payable). In transaction currency.
- Depreciation: scheduled. Straight-line default; supports MACRS for tax purposes if needed (book and tax often differ).
- Disposal: Dr Cash + Dr Accumulated Depreciation + Dr/Cr Loss/Gain, Cr Fixed Asset.
- Fixed assets are NOT remeasured for FX (non-monetary). Held at historical cost in functional currency.

## Intercompany (multi-entity specific)

- Every intercompany transaction creates paired journal entries — one in each entity.
- Paired via `intercompany_pair_id`.
- Amounts must agree in transaction currency (rounding tolerance: TBD).
- Pre-close: run intercompany matching report; resolve mismatches before close.
- Pre-consolidation: same check at group level.

## Corporate card rules

- Treated as a bank account with `account_subtype = 'corporate_card'`.
- Card liability account on the balance sheet.
- Monthly: Dr categorized expenses, Cr Card Liability for the period's spend.
- Statement payment: Dr Card Liability, Cr Cash.
- Reconciliation works the same as bank accounts.
- Categorization happens in the card provider (Ramp); imported with category metadata; mapped to GL accounts via configurable rules.

## Tax

- System does not compute income tax.
- Tax provision and return prep are external.
- System stores tax-relevant data (1099-reportable payments, fixed asset detail) for external prep.
- Sales tax: out of scope for v1 unless any entity has sales tax obligations (deferred decision).

## SoD policy

- Created-by and posted-by are separate fields. Same-user posting requires override flag (audit-logged).
- AP bills require approver identity recorded.
- Bank reconciliation approver recorded.
- Future role split: bookkeeper creates drafts, controller posts.

## What this system does NOT enforce

- Tax law correctness (external)
- GAAP disclosure requirements (system stores data; disclosures drafted externally)
- Cash forecasting (later)
- Budget vs. actual (later)
