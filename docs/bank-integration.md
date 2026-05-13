# Bank Integration Architecture

## Overview

The bank integration system handles:
- **Plaid OAuth flow** for secure bank account linking (30-100 accounts)
- **Transaction webhooks and polling** for automatic data sync
- **Bank reconciliation engine** with auto-matching (80%+ accuracy target)
- **Corporate card support** (Ramp, Amex) treated as bank accounts
- **Multi-currency reconciliation** with proper FX handling
- **Outstanding item tracking** for timing differences
- **Approval chain** for reconciliation sign-off

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend: Bank Account Setup & Reconciliation UI   │
└────────────────────┬────────────────────────────────┘
                     │
       ┌─────────────┼──────────────┐
       │             │              │
       v             v              v
  PlaidClient  ReconciliationEngine  Dashboard
  (OAuth flow)  (Auto-matching)     (Status & Reports)
       │             │              │
       └─────────────┼──────────────┘
                     │
       ┌─────────────┼──────────────┐
       │             │              │
       v             v              v
  BankAccount  BankTransaction  BankReconciliation
  BankReconciliationLine
       │
       v
   Database (Postgres)
```

## Models

### BankAccount
Represents a bank account or corporate card linked to an entity.

**Key fields:**
- `entity_id`: The entity that owns this account
- `institution`: 'chase', 'bofa', 'ramp', 'amex', etc.
- `account_number`: Last 4 digits or masked value
- `functional_currency`: ISO 4217 currency code (USD, EUR, etc.)
- `plaid_item_id`: Plaid's unique identifier for this linked account
- `plaid_access_token`: Encrypted token for API calls
- `gl_account_id`: GL account for reconciliation adjustments

**Corporate cards:**
Corporate cards (Ramp, Amex) are modeled as `BankAccount` with `institution='ramp'` or `institution='amex'`. They reconcile the same way as bank accounts.

### BankTransaction
A single transaction from a bank feed.

**Key fields:**
- `bank_account_id`: Which account this transaction belongs to
- `transaction_date`: Date the transaction occurred
- `posted_date`: Date the transaction appeared in the account (may differ)
- `amount`: Signed amount (negative for withdrawals, positive for deposits)
- `description`: Merchant/payor description from bank
- `plaid_transaction_id`: Unique ID from Plaid (for deduplication)
- `status`: 'unmatched', 'matched', 'duplicate', 'ignored'
- `matched_journal_entry_id`: GL entry ID if matched

**Invariant:** Bank transactions are immutable once created from a bank feed. They are never updated. Corrections are made by creating new transactions or marking as ignored.

### BankReconciliation
A monthly or periodic reconciliation of a bank account.

**Key fields:**
- `bank_account_id`: Which account
- `as_of_date`: Reconciliation cutoff (typically month-end)
- `beginning_balance_per_books`: Opening balance
- `statement_balance`: Balance per bank statement
- `book_balance`: Balance per GL entries
- `variance`: `statement_balance - book_balance` (should be 0 when complete)
- `status`: 'incomplete', 'in_progress', 'complete', 'approved'
- `matched_count`, `unmatched_count`, `outstanding_items_count`

**State machine:**
```
incomplete → in_progress → complete → approved
```

**Invariant:** A reconciliation is incomplete until:
1. `book_balance + outstanding_items_net_effect == statement_balance`
2. No large unmatched items (> $1,000 threshold)
3. `variance == 0`

### BankReconciliationLine
A single line item in a reconciliation (matched, outstanding, or unmatched).

**Types:**
- **matched**: Bank transaction paired with a GL entry (amount must match exactly)
- **outstanding**: GL entry not yet appeared in bank (timing difference, e.g., check in transit)
- **unmatched**: Bank transaction with no GL entry (flagged for manual review)

**Key fields:**
- `reconciliation_id`: Which reconciliation this line belongs to
- `line_type`: 'matched', 'outstanding', 'unmatched'
- `bank_transaction_id`: If matched or unmatched
- `journal_entry_id`: If matched or outstanding
- `amount`: Signed amount in account currency
- `transaction_date`: Date of the transaction

## Plaid Integration

### OAuth Flow

1. **User initiates link:** Click "Add Bank Account"
2. **Generate link token:**
   ```python
   client = PlaidClient()
   link_token = client.create_link_token(
       user_id=user.id,
       webhook="https://accounting-system.com/webhook/plaid"
   )
   ```
3. **User completes Link flow:** Enters bank credentials in Plaid's UI
4. **Backend receives public token:** From Plaid's callback
5. **Exchange public token for access token:**
   ```python
   access_token, item_id = client.exchange_public_token(public_token)
   ```
6. **Store credentials securely:**
   ```python
   bank_account.plaid_access_token = access_token  # Encrypt at rest
   bank_account.plaid_item_id = item_id
   bank_account.save()
   ```

### Transaction Sync

#### Webhook Approach (Recommended for real-time)
Plaid sends a webhook when transactions are added, removed, or updated:

```python
# POST /webhook/plaid
webhook_data = request.json  # Plaid webhook payload
handle_transactions_webhook(webhook_data)
```

Webhook types:
- `TRANSACTIONS_ADDED`: New transactions to fetch
- `TRANSACTIONS_REMOVED`: Transactions removed (account correction)

#### Polling Approach (Fallback)
Daily scheduled task fetches transactions:

```python
for bank_account in BankAccount.objects.filter(status='active'):
    fetch_transactions_for_account(bank_account)
```

### Error Handling

Plaid API failures are handled gracefully:

**Item errors** (account linkage broken):
- `ITEM_LOGIN_REQUIRED`: User needs to re-authenticate
- `ITEM_NOT_FOUND`: Item ID is invalid
- `INSTITUTION_NOT_FOUND`: Bank no longer supported

**Transaction errors:**
- `INVALID_REQUEST`: Bad parameters
- `RATE_LIMIT_EXCEEDED`: Too many requests

When a critical error occurs:
1. Log the error with `logger.error()`
2. Mark the bank account as needing attention
3. Alert the user in the dashboard
4. Retry on next scheduled fetch

## Reconciliation Engine

### Auto-Matching Algorithm

The engine attempts to match bank transactions to GL entries automatically:

**Matching strategy (in priority order):**

1. **Exact match (80%+ coverage):**
   - Amount matches exactly (to 4 decimal places)
   - Transaction date is within ±5 days
   - Description keywords overlap

2. **Fuzzy date match:**
   - Amount matches exactly
   - Date is within ±10 days
   - Merchant name contains keywords

3. **Manual matching:**
   - User explicitly pairs transaction to GL entry via UI

**Accuracy targets:**
- **80%+ automated matching** for typical business (most transactions match cleanly)
- **<5% duplicate matches** (same transaction matched multiple times)
- **<10% false positives** (wrong entries matched)

### Reconciliation Workflow

1. **Create reconciliation** for a month/period:
   ```python
   engine = ReconciliationEngine(bank_account)
   recon = engine.create_reconciliation(
       as_of_date=datetime(2024, 5, 31),
       statement_balance=Decimal('50000.00')
   )
   ```

2. **Fetch statement balance** from bank file or API

3. **Auto-match transactions:**
   ```python
   matched_count, errors = engine.auto_match(recon)
   ```

4. **Flag outstanding items:**
   ```python
   engine.flag_outstanding_items(recon)
   ```

5. **Calculate variance:**
   ```python
   variance = engine.calculate_variance(recon)
   ```

6. **Review and adjust** (manually):
   - Match remaining unmatched items
   - Add outstanding items
   - Correct any mismatches

7. **Check completion:**
   ```python
   if engine.is_complete(recon):
       recon.status = 'complete'
       recon.save()
   ```

8. **Approve:**
   ```python
   recon.status = 'approved'
   recon.approved_at = timezone.now()
   recon.approved_by = user_id
   recon.save()
   ```

### Multi-Currency Reconciliation

When reconciling accounts in foreign currencies:

**Key invariants:**
- All amounts are stored in account currency (which is the functional currency of the entity)
- FX rates are applied when translating GL entries (if needed for consolidated reporting)
- Reconciliation comparison is always in the account's functional currency

**Example:**
- USD account: reconcile in USD
- EUR account: reconcile in EUR
- JPY account: reconcile in JPY

Each bank account has a `functional_currency` field. All transactions and reconciliation are conducted in that currency.

## API Endpoints (to be implemented)

### OAuth Linking
- `POST /api/bank-accounts/link-start` → Returns link token
- `POST /api/bank-accounts/link-exchange` → Exchanges public token for access token

### Bank Accounts
- `GET /api/bank-accounts` → List accounts for entity
- `POST /api/bank-accounts` → Create new account (manual entry)
- `GET /api/bank-accounts/{id}` → Get account details
- `DELETE /api/bank-accounts/{id}` → Archive account

### Bank Transactions
- `GET /api/bank-accounts/{id}/transactions` → List transactions (paginated, filterable by date/status)
- `POST /api/bank-accounts/{id}/transactions/fetch` → Manual fetch from Plaid

### Reconciliations
- `POST /api/bank-accounts/{id}/reconciliations` → Create new reconciliation
- `GET /api/reconciliations` → List reconciliations
- `GET /api/reconciliations/{id}` → Get details
- `POST /api/reconciliations/{id}/match` → Manually match a transaction
- `POST /api/reconciliations/{id}/unmatch` → Remove a match
- `POST /api/reconciliations/{id}/complete` → Mark as complete
- `POST /api/reconciliations/{id}/approve` → Approve

### Webhooks
- `POST /webhook/plaid` → Receives Plaid transaction webhooks

## Testing

### Test Coverage (120+ tests)

**Plaid client tests:**
- OAuth flow (link token, public token exchange)
- Transaction fetching (single fetch, pagination)
- Webhook parsing (TRANSACTIONS_ADDED, TRANSACTIONS_REMOVED)
- Error handling (network errors, API errors, invalid credentials)
- Deduplication (same transaction twice)

**Reconciliation tests:**
- Reconciliation creation with previous balance
- Auto-matching algorithm
- Outstanding item tracking
- Variance calculation
- State transitions (incomplete → complete → approved)
- Multi-currency handling
- Decimal precision (all amounts are Decimal, not float)

**Integration tests:**
- Plaid → BankTransaction → Reconciliation workflow
- Corporate card reconciliation (Ramp, Amex)
- Multi-entity bank accounts
- Concurrent reconciliations across multiple accounts

### Running Tests

```bash
# All tests
pytest apps/integrations/tests/

# Plaid tests only
pytest apps/integrations/tests/test_plaid.py -v

# Reconciliation tests only
pytest apps/integrations/tests/test_reconciliation.py -v

# With coverage
pytest --cov=apps.integrations apps/integrations/tests/

# Specific test
pytest apps/integrations/tests/test_plaid.py::TestPlaidClient::test_create_link_token -v
```

## Security Considerations

### Plaid Access Tokens
- Stored encrypted at rest in the database
- Never logged or exposed in error messages
- Rotated when user re-links account
- Revoked when account is archived

### Webhook Signature Verification
- All incoming Plaid webhooks are verified via HMAC-SHA256
- Signature mismatch results in rejection (400 error)
- No processing occurs without valid signature

### Bank Account Information
- Account numbers are masked (last 4 digits only)
- Tax ID on Entity is encrypted (separate from BankAccount)
- GL account linkage is audit-logged

## Future Enhancements

### Phase 2 (Post v0.3)
- **CSV/OFX import:** For non-Plaid banks
- **Bank statement file upload:** PDF parsing for balance extraction
- **Ramp API integration:** Automatic corporate card transaction sync
- **FX gain/loss entries:** Auto-post period-end FX adjustments from reconciliation
- **Dashboard:** Real-time reconciliation status, aged unmatched items, exception reports

### Phase 3+
- **Matching ML:** Learn from user-corrected matches to improve algorithm
- **Bank connectivity:** Direct bank API integration (beyond Plaid)
- **PBC schedules:** Bank reconciliation summary in audit package
- **Intercompany reconciliation:** Match transactions across entities

## References

- **Plaid API docs:** https://plaid.com/docs/api
- **Django ORM:** https://docs.djangoproject.com/en/5.0/topics/db/models/
- **Decimal precision:** https://docs.python.org/3/library/decimal.html

## Related Docs

- `docs/accounting-rules.md` — Bank reconciliation is first-class; immutability rules
- `docs/data-model.md` — BankAccount, BankTransaction, BankReconciliation schemas
- `docs/regulatory.md` — SOX testing requirements for bank reconciliation
