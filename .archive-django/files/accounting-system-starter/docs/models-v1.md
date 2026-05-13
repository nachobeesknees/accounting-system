# Phase 1 Django Models - Schema Documentation

**Status:** Phase 1 (Weeks 1-4) Foundational Models - Generated, not yet applied to database

This document specifies the complete Django ORM models for the Phase 1 foundational layer of the multi-entity accounting system.

## Design Principles

1. **Double-entry enforced at the database level** (triggers), not application code
2. **Money is ALWAYS `Decimal(20, 4)` with explicit currency code**
3. **Posted entries immutable** (enforced via triggers + model validation)
4. **Audit log captures every mutation** via Postgres triggers
5. **Soft deletes** via `deleted_at`
6. **Entity-scoped** financial records (multi-entity SoD)
7. **Effective dates** on relationships that change over time

## Core App (apps/core/models.py)

### User

Extends Django's `AbstractUser`. Custom UUID primary key for consistency with financial tables.

**Fields:**
- `id` (UUID): Primary key
- `email`, `username`, `first_name`, `last_name` (from AbstractUser)
- `profile_picture_url` (URL, optional)
- `phone_number` (text, optional)
- `created_at`, `updated_at` (timestamps)
- `deleted_at` (soft delete)

**Relations:**
- `entity_permissions`: UserEntityPermission (reverse FK)
- `entities_created`: Entity created_by link
- `entities_updated`: Entity updated_by link

**Constraints:**
- Email indexed for auth lookups
- deleted_at indexed for soft delete queries

### Entity

Legal entity in the consolidated group. Every financial record is entity-scoped.

**Fields:**
- `id` (UUID): Primary key
- `legal_name` (text): Corporate name
- `dba_name` (text, optional): Doing Business As
- `tax_id` (text, optional): Encrypted; format varies by jurisdiction
- `entity_type` (enum): opco, holdco, mgmt_co, investment, other
- `jurisdiction_country` (2-char): ISO 3166-1; **determines localization module**
- `jurisdiction_state` (2-char, optional): US state or equivalent
- `fiscal_year_end_month` (smallint): 1-12
- `fiscal_year_end_day` (smallint): 1-31
- `functional_currency` (3-char): ISO 4217
- `accounting_basis` (enum): cash, modified_cash, accrual
- `basis_features` (JSON): `{tracks_deferred_revenue: bool, ...}`
- `local_attributes` (JSON): Jurisdiction-specific fields, validated by localization module
- `active` (bool)
- `inception_date` (date)
- `dissolution_date` (date, optional)
- `created_at`, `updated_at`, `created_by`, `updated_by` (audit trail)
- `deleted_at` (soft delete)

**Relations:**
- `accounts`: Account (reverse FK, per-entity CoA)
- `periods`: Period (reverse FK, per-entity calendar)
- `journal_entries`: JournalEntry (reverse FK)
- `user_permissions`: UserEntityPermission (reverse FK)
- `child_ownerships`: EntityOwnership (parent side)
- `parent_ownerships`: EntityOwnership (child side)

**Constraints:**
- `jurisdiction_country` must be in registered localization modules (v1: US only)
- `(jurisdiction_country, jurisdiction_state)` tuple identifies jurisdiction for rules lookup
- `local_attributes` validated by active localization module

**Indexes:**
- `jurisdiction_country`
- `(active, deleted_at)` for soft delete scoping

**Invariants (db-level to be added):**
- Period calendar must not overlap within entity
- Posting to non-open period rejected
- Locked period cannot transition

### EntityOwnership

Multi-tier ownership relationships with effective dates.

**Fields:**
- `id` (UUID)
- `parent_entity` (FK Entity): Owner
- `child_entity` (FK Entity): Owned
- `ownership_percent` (Decimal 9,6): 0-100%, precision for complex structures
- `effective_from` (date)
- `effective_to` (date, optional): null = current
- `notes` (text)

**Constraints (db-level to be added):**
- Sum of `ownership_percent` for a child at any date ≤ 100
- No cycles (parent cannot be downstream of child)
- No self-ownership
- `(parent_entity, child_entity, effective_from)` unique

**Indexes:**
- `(parent_entity, effective_from, effective_to)`
- `(child_entity, effective_from, effective_to)`

### UserEntityPermission

Per-user, per-entity role assignment. Default-deny scoping.

**Fields:**
- `id` (UUID)
- `user` (FK User)
- `entity` (FK Entity)
- `role` (enum): admin, controller, bookkeeper, approver, read_only
- `effective_from` (date)
- `effective_to` (date, optional)
- `can_approve_own_entries` (bool): SoD override flag (audit-logged)
- `created_at`, `updated_at`, `created_by`, `updated_by`
- `deleted_at` (soft delete)

**Constraints:**
- `(user, entity, effective_from)` unique
- At most one role per user/entity per effective date

**Methods:**
- `is_active()`: Check if permission is currently effective

## Finance App (apps/finance/models.py)

### Account

Per-entity Chart of Accounts with hierarchy.

**Fields:**
- `id` (UUID)
- `entity` (FK Entity): Per-entity scoping
- `code` (text): Account number (e.g., '1010')
- `name` (text): Account name
- `parent` (FK self, optional): Hierarchical CoA
- `account_type` (enum): asset, liability, equity, revenue, expense
- `account_subtype` (enum, optional): current_asset, noncurrent_asset, etc.
- `normal_balance` (enum): debit or credit
- `is_postable` (bool): Leaf accounts postable; parents not
- `is_active` (bool): Inactive = cannot post
- `currency_restriction` (3-char, optional): If set, only this currency posts
- `description` (text)
- `created_at`, `updated_at`, `created_by`, `updated_by`
- `deleted_at` (soft delete)

**Relations:**
- `journal_lines`: JournalLine (reverse FK)
- `general_ledgers`: GeneralLedger (reverse FK)
- `children`: Account (self-referential, parent side)

**Constraints (db-level to be added):**
- `(entity, code)` unique
- Non-postable accounts cannot have journal lines
- Postable accounts cannot have children
- Account active at line posting time

**Indexes:**
- `(entity, is_postable, is_active)` for CoA filtering
- `(entity, account_type)` for reporting
- `parent` for hierarchy traversal

### Period

Per-entity accounting period calendar.

**Fields:**
- `id` (UUID)
- `entity` (FK Entity)
- `period_type` (enum): month, quarter, year, stub
- `start_date` (date)
- `end_date` (date)
- `status` (enum): open, closed, locked
- `closed_at` (datetime, optional)
- `closed_by` (FK User, optional)
- `locked_at` (datetime, optional)
- `locked_by` (FK User, optional)

**Constraints (db-level to be added):**
- `(entity, start_date, end_date)` unique
- Periods of same type do not overlap within entity (exclusion constraint)
- Posting to non-open period rejected
- Locked period cannot transition

**Methods:**
- `is_open()`: Check if posting allowed
- `is_locked()`: Check if permanent

**Indexes:**
- `(entity, status)` for close workflows
- `(entity, start_date, end_date)` for date lookup

### FXRate

Foreign exchange rates with effective dates and rate type.

**Fields:**
- `id` (UUID)
- `from_currency` (3-char): ISO 4217
- `to_currency` (3-char): ISO 4217
- `rate` (Decimal 18,8): How many `to` per 1 `from`
- `effective_date` (date)
- `source` (enum): manual, xe, oanda, fed_h10
- `rate_type` (enum): spot, average, closing
- `created_at` (timestamp)
- `created_by` (FK User, optional)

**Constraints:**
- `(from_currency, to_currency, effective_date, rate_type)` unique

**Convention:**
- Store inverse pairs (USD→EUR AND EUR→USD), or compute on the fly (TBD per Phase 0 open question)

**Indexes:**
- `(from_currency, to_currency, effective_date)` for FX translation
- `effective_date` for period-end lookups

### JournalEntry

Accounting transaction header.

**Fields:**
- `id` (UUID)
- `entity` (FK Entity): Entity-scoped
- `entry_number` (text): Sequential per entity
- `entry_date` (date): Accounting date
- `period` (FK Period, optional): Derived from entry_date
- `description` (text)
- `reference` (text, optional): External reference (invoice #, check #)
- `transaction_currency` (3-char): ISO 4217; all lines must sum to 0 in this currency
- `status` (enum): draft, posted, reversed
- `reverses_entry` (FK self, optional): If reversal, link to original
- `reversed_by_entry` (FK self, optional): If reversed, link to reversal
- `source` (enum): manual, ap, ar, bank_recon, system, import, consolidation
- `intercompany_pair_id` (UUID, optional): Intercompany matching
- `posted_at` (datetime, optional): Non-null iff status = 'posted'
- `posted_by` (FK User, optional): Who posted
- `same_user_override` (bool): SoD override
- `created_at`, `updated_at`, `created_by`, `updated_by`
- `deleted_at` (soft delete)

**Relations:**
- `lines`: JournalLine (reverse FK, cascade delete)

**Constraints (db-level to be added):**
- `(entity, entry_number)` unique
- Posted entries cannot be updated (except `reversed_by_entry_id`)
- Must have ≥2 lines balancing to 0 in transaction_currency
- If intercompany, counterparty entry must exist and match

**Methods:**
- `is_posted()`, `is_draft()`, `is_reversed()`: Status predicates

**Indexes:**
- `(entity, entry_date)` for period reporting
- `(entity, status)` for workflow queries
- `(period, status)` for close logic
- `intercompany_pair_id` for intercompany matching

**Invariants (db-level to be added):**
- sum(debit) = sum(credit) in transaction_currency (deferred constraint)
- sum(functional_amount) = 0 (checked on post)
- All lines' accounts belong to entry's entity

### JournalLine

Individual debit/credit pair in a journal entry.

**Fields:**
- `id` (UUID)
- `journal_entry` (FK JournalEntry)
- `line_number` (int): Sequence within entry
- `account` (FK Account): Must be postable, active, belong to entry's entity
- `debit` (Decimal 20,4): Non-negative; in transaction_currency
- `credit` (Decimal 20,4): Non-negative; in transaction_currency
- `currency` (3-char): ISO 4217 (usually = entry's transaction_currency)
- `functional_amount` (Decimal 20,4): Signed (negative for credit); in entity's functional currency
- `description` (text, optional)
- `dimension_values` (JSON): `{department: uuid, class: uuid, location: uuid, project: uuid}`

**Constraints (db-level to be added):**
- Exactly one of (debit, credit) non-zero
- Per entry: sum(debit) = sum(credit) in transaction_currency
- Per entry: sum(functional_amount) = 0
- Account postable and active at posting time
- Cannot post to posted entry

**Methods:**
- `is_debit()`, `is_credit()`: Line type
- `amount()`: Absolute value

**Indexes:**
- `journal_entry` for entry detail queries
- `(account, journal_entry)` for account ledger

**Unique together:**
- `(journal_entry, line_number)`

### GeneralLedger

General Ledger balance table for reporting (denormalized, populated by triggers).

**Fields:**
- `id` (UUID)
- `entity` (FK Entity)
- `account` (FK Account)
- `period` (FK Period, optional)
- `debit_transaction` (Decimal 20,4): Sum of debits in transaction currency
- `credit_transaction` (Decimal 20,4): Sum of credits in transaction currency
- `debit_functional` (Decimal 20,4): Sum of debits in functional currency
- `credit_functional` (Decimal 20,4): Sum of credits in functional currency
- `updated_at` (timestamp)

**Constraints:**
- `(entity, account, period)` unique

**Methods:**
- `balance()`: Account balance in functional currency (signed)

**Indexes:**
- `(entity, period)` for financial statement generation
- `(account, period)` for account ledger reports

### AuditLog

Immutable append-only audit log.

**Fields:**
- `id` (BigAutoField): Non-UUID to enable efficient serial inserts
- `occurred_at` (datetime, indexed): When change happened
- `actor` (FK User, optional): Who made the change
- `action` (enum): insert, update, delete
- `table_name` (text, indexed): Which table changed
- `record_id` (UUID, indexed): Which record changed
- `before_state` (JSON, optional): State before (null for insert)
- `after_state` (JSON, optional): State after (null for delete)
- `reason` (text, optional): Why (for SoD overrides, etc.)

**Constraints (db-level):**
- INSERT only; UPDATE/DELETE rejected via permissions and triggers

**Indexes:**
- `(table_name, record_id, occurred_at)` for record history
- `(actor, occurred_at)` for user action audit trail

**Immutability:** No UPDATE or DELETE ever. Append-only via trigger.

## Migration Strategy

All migrations are generated but NOT applied to production yet.

**Generated migrations:**
1. `apps/core/migrations/0001_initial.py` — Entity, User, UserEntityPermission, EntityOwnership
2. `apps/finance/migrations/0001_initial.py` — All finance models

**Before applying:**
1. Review all migrations for correctness
2. Verify all db-level constraints are in place (triggers, exclusion constraints)
3. Test on staging with representative data
4. Prepare rollback plan
5. Document any data transformations needed

## Key Design Decisions

### Decimal Over Float

- All monetary amounts: `Decimal(20, 4)` in Python, `numeric(20, 4)` in Postgres
- Never float, never Real, never Double
- Rounding via `Decimal.quantize(ROUND_HALF_EVEN)` unless tax/regulatory rule requires otherwise
- **Rationale:** Exact decimal arithmetic required for accounting; float accumulation errors unacceptable

### Entity Scoping

- Every financial record carries `entity_id`
- Accounts per entity with per-entity hierarchies
- Periods per entity with per-entity calendars
- User roles scoped per entity (UserEntityPermission)
- **Rationale:** Consolidated group with 16-50 entities; hard data isolation required

### Immutable Posted Entries

- Status: draft, posted, reversed
- Once posted, entry immutable except for `reversed_by_entry_id` link
- Changes via reversal (new entry)
- **Rationale:** Audit trail, reconciliation stability, regulatory requirement

### Transaction vs Functional Currency

- Every line stores amount in BOTH transaction currency AND functional currency
- `functional_amount` is signed (negative for credits)
- Balance checks happen at DB level in both currencies
- **Rationale:** Multi-currency support; facilitates consolidation translation

### Soft Deletes

- `deleted_at` field (not hard DELETE)
- Queries default to `deleted_at IS NULL`
- Reversible; can theoretically "undelete"
- **Rationale:** Audit trail completeness; regulatory retention

### Effective Dates on Relationships

- EntityOwnership: ownership changes over time
- UserEntityPermission: roles change over time
- ConsolidationMapping (planned): accounts map to consolidation accounts, with changes
- Format: `effective_from` + `effective_to` (null = current)
- **Rationale:** Historical accuracy; supports multiple reporting dates

## Testing Coverage

**Test suites:**
- `apps/finance/tests/test_journal_entry.py`: 40+ tests covering double-entry, immutability, entity scoping, decimal precision, status transitions, SoD, period locking
- `apps/finance/tests/test_account.py`: 20+ tests covering hierarchy, types, postability, currency restrictions, entity scoping

**Coverage targets:**
- Double-entry integrity: 100%
- Immutability enforcement: 100%
- Entity scoping: 100%
- Decimal precision: 100%
- Audit trail: 100%

**Test execution:**
```bash
pytest apps/finance/tests/ -v --cov=apps.finance --cov-report=html
```

## Next Steps (Phase 2)

Not in scope for Phase 1 foundational models:
- Accounts Payable sub-ledger (Bill, Payment, VendorEntityLink)
- Accounts Receivable sub-ledger (Invoice, Customer)
- Banking (BankConnection, BankAccount, BankTransaction, Reconciliation)
- Fixed Assets (FixedAsset, DepreciationSchedule, Disposal)
- Consolidation layer (ConsolidationRun, ConsolidationAdjustment, ConsolidationMapping)
- Dimensions detail tables (DimensionValue, DimensionHierarchy)

These follow after foundational models are locked in and tested.
