# Data Model

Source of truth for schema design. Reflects all Phase 0 decisions: multi-entity, multi-tier ownership, multi-currency with multiple functional currencies, per-entity CoA with consolidation mapping, dimensions, mixed basis, mixed fiscal years.

## Design principles

1. **Double-entry enforced at the database**, not in application code.
2. **Posted entries immutable.** Enforced via triggers.
3. **Audit log captures every mutation** via Postgres triggers.
4. **All money is `numeric(20, 4)` with explicit currency code.**
5. **Soft deletes** via `deleted_at`.
6. **UUIDs on all financial tables.** Human-readable identifiers separate.
7. **Entity-scoped almost everything.** `entity_id` is non-negotiable for financial records.
8. **Effective dates on relationships** that change over time (ownership, CoA mappings, FX rates, exchange rates).

## Core entities

### `entities`
Legal entities the system books for.

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| legal_name | text | |
| dba_name | text | nullable |
| tax_id | text | nullable; encrypted at rest. Local format varies by jurisdiction (EIN, RUT, VAT number, Codice Fiscale, etc.) |
| entity_type | text | 'opco', 'holdco', 'mgmt_co', 'investment', 'other' |
| jurisdiction_country | text(2) | ISO 3166-1; **drives which localization module applies (see `docs/localization.md`)** |
| jurisdiction_state | text | nullable, US states / equivalent |
| fiscal_year_end_month | smallint | 1-12 |
| fiscal_year_end_day | smallint | 1-31 |
| functional_currency | text(3) | ISO 4217 |
| accounting_basis | text | 'cash', 'modified_cash', 'accrual' |
| basis_features | jsonb | flags like `{tracks_deferred_revenue: true}` |
| local_attributes | jsonb | jurisdiction-specific required fields (e.g., Codice Fiscale for IT, RUT for UY, Companies House number for UK) — schema enforced by the localization module |
| active | bool | |
| inception_date | date | |
| dissolution_date | date | nullable |
| created_at, updated_at, created_by, updated_by | | |
| deleted_at | timestamptz | nullable |

Constraints:
- `jurisdiction_country` must match a registered localization module (in v1, only US is registered; other countries rejected at entity creation until their module ships)
- `local_attributes` schema validated by the active localization module for the entity's jurisdiction

### `entity_ownership`
Multi-tier ownership relationships with effective dates.

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| parent_entity_id | uuid fk entities | |
| child_entity_id | uuid fk entities | |
| ownership_percent | numeric(9, 6) | 0 to 100 |
| effective_from | date | |
| effective_to | date | nullable; null = current |
| notes | text | |

Constraints:
- Sum of ownership_percent for a child at any effective date <= 100
- No cycles (a parent cannot be downstream of its child)
- Self-ownership rejected

### `accounts` (per-entity chart of accounts)

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| entity_id | uuid fk | per-entity scoped |
| code | text | e.g., '1010' |
| name | text | |
| parent_id | uuid fk self | hierarchical within entity |
| account_type | text | 'asset', 'liability', 'equity', 'revenue', 'expense' |
| account_subtype | text | optional refinement, e.g. 'current_asset' |
| normal_balance | text | 'debit' or 'credit' |
| is_postable | bool | leaf accounts postable; parents not |
| is_active | bool | |
| description | text | |
| currency_restriction | text(3) | nullable; if set, only that currency posts |

Constraints:
- `(entity_id, code)` unique
- Non-postable accounts cannot have journal lines
- Postable accounts cannot have children

### `consolidation_accounts`
Group-level chart of accounts for consolidated reporting.

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| code | text | unique globally |
| name | text | |
| parent_id | uuid fk self | |
| account_type | text | same enum as accounts |
| display_order | int | |

### `consolidation_mapping`
Maps entity accounts to consolidation accounts. Many-to-one. With effective dates.

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| entity_id | uuid fk | |
| account_id | uuid fk accounts | |
| consolidation_account_id | uuid fk consolidation_accounts | |
| effective_from | date | |
| effective_to | date | nullable |
| notes | text | |

Constraints:
- An entity account maps to at most one consolidation account at a given date
- Unmapped entity accounts surface in UI as "needs mapping" warnings

### `dimensions`
Configurable dimension types per entity (department, class, location, project).

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| entity_id | uuid fk | per-entity since CoA is per-entity |
| dimension_type | text | 'department', 'class', 'location', 'project', 'custom' |
| name | text | |
| code | text | |
| parent_id | uuid fk self | optional hierarchy |
| active | bool | |

Constraints:
- `(entity_id, dimension_type, code)` unique

### `periods`

Per-entity period calendar.

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| entity_id | uuid fk | |
| period_type | text | 'month', 'quarter', 'year', 'stub' |
| start_date | date | |
| end_date | date | |
| status | text | 'open', 'closed', 'locked' |
| closed_at | timestamptz | |
| closed_by | uuid fk users | |
| locked_at | timestamptz | |
| locked_by | uuid fk users | |

Constraints:
- Periods of the same type do not overlap within an entity (Postgres exclusion constraint)
- Posting to a non-open period is rejected at DB level
- A locked period cannot transition to any other status

### `fx_rates`

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| from_currency | text(3) | |
| to_currency | text(3) | |
| rate | numeric(18, 8) | how many `to` per 1 `from` |
| effective_date | date | |
| source | text | 'manual', 'xe', 'oanda', 'fed_h10', etc. |
| rate_type | text | 'spot', 'average', 'closing' |

Constraints:
- `(from_currency, to_currency, effective_date, rate_type)` unique
- Convention: store inverse pairs (USD→EUR AND EUR→USD) or compute on the fly. Decision pending.

### `journal_entries`

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| entity_id | uuid fk | |
| entry_number | text | server-generated, sequential per entity |
| entry_date | date | accounting date |
| period_id | uuid fk | derived from entry_date + entity, stored for index |
| description | text | |
| reference | text | external reference (invoice #, check #) |
| status | text | 'draft', 'posted', 'reversed' |
| reverses_entry_id | uuid fk self | if reverses another |
| reversed_by_entry_id | uuid fk self | if reversed by another |
| source | text | 'manual', 'ap', 'ar', 'bank_recon', 'system', 'import', 'consolidation' |
| transaction_currency | text(3) | the currency the entry is denominated in |
| intercompany_pair_id | uuid | if intercompany, links to the matching entry in the counterparty |
| created_at, updated_at, created_by, updated_by | | |
| posted_at, posted_by | | non-null iff status = 'posted' |

Constraints:
- Posted entries cannot be updated (except `reversed_by_entry_id`)
- Created_by != posted_by by default (SoD); override flag for documented exceptions
- Must have ≥2 journal lines balancing to zero in transaction_currency
- If intercompany, the counterparty entry must exist and match in absolute amount

### `journal_lines`

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| journal_entry_id | uuid fk | |
| line_number | int | within entry |
| account_id | uuid fk | must be postable, must belong to entry's entity |
| debit | numeric(20, 4) | non-negative |
| credit | numeric(20, 4) | non-negative |
| currency | text(3) | usually = entry's transaction_currency |
| description | text | |
| functional_amount | numeric(20, 4) | translated to entity's functional currency at entry date FX rate; signed (negative for credit) |
| dimension_values | jsonb | `{department: 'uuid', class: 'uuid', location: 'uuid', project: 'uuid'}` |

Constraints:
- Exactly one of (debit, credit) non-zero
- Per entry: sum(debit) = sum(credit) in transaction_currency — deferred DB constraint
- Per entry: sum(functional_amount) = 0 — also enforced
- Account postable, active, belongs to entry's entity
- Dimension values reference existing dimensions of the entry's entity

### `consolidation_runs`
A specific consolidation execution.

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| as_of_date | date | the consolidation cutoff |
| reporting_currency | text(3) | |
| parent_entity_id | uuid fk | the top of the consolidated group (could be a non-real "Group" entity) |
| status | text | 'in_progress', 'complete', 'finalized' |
| started_at | timestamptz | |
| completed_at | timestamptz | |
| executed_by | uuid fk users | |
| notes | text | |

### `consolidation_adjustments`
Entries that live at the consolidation layer, not in entity books.

| field | type | notes |
|---|---|---|
| id | uuid pk | |
| consolidation_run_id | uuid fk | |
| adjustment_type | text | 'elimination', 'basis_normalization', 'reclassification', 'translation' |
| description | text | |
| status | text | 'draft', 'applied' |
| ... | | (lines similar to journal_lines, but referenced to consolidation_accounts) |

Eliminations match intercompany pairs and zero them out. Basis normalization handles cases like reversing deferred revenue at consolidation. Translation adjustments are the CTA entries.

### `audit_log`

| field | type | notes |
|---|---|---|
| id | bigserial pk | |
| occurred_at | timestamptz | |
| actor_id | uuid | from session GUC |
| action | text | 'insert', 'update', 'delete' |
| table_name | text | |
| record_id | uuid | |
| before_state | jsonb | null for inserts |
| after_state | jsonb | null for deletes |
| reason | text | optional |

Constraints:
- INSERT only. UPDATE and DELETE rejected via permissions and triggers.

## Sub-ledger entities (v1 scope)

### Accounts Payable

- `vendors` — vendor master, per entity (vendor can exist across multiple entities)
- `vendor_entity_links` — vendor-to-entity many-to-many with entity-specific data
- `bills` — incoming bills with header, status, link to journal entry
- `bill_lines` — line items mapping to expense accounts and dimensions
- `payments` — payments made, link to JE
- `payment_applications` — N:M between payments and bills

### Banking and corporate cards

- `bank_connections` — connection metadata (`plaid`, `direct_api`, `manual`, `ramp`)
- `bank_accounts` — bank account master, linked to GL account, currency, entity
- `bank_transactions` — raw transactions, status ('pending', 'posted', 'matched', 'excluded')
- `reconciliations` — recon header with statement balance, book balance, status
- `reconciliation_items` — matched bank transactions to journal lines

Corporate cards (Ramp, Amex) modeled as bank accounts with `account_subtype = 'corporate_card'`.

### Fixed Assets

- `fixed_assets` — asset master, acquisition date, cost (with currency), useful life, depreciation method
- `depreciation_schedules` — generated schedule
- `disposals` — sale or write-off events

### AR (lighter in v1)

- `customers`
- `invoices`, `invoice_lines`
- Payments share infrastructure with AP payments

### Documents

- `documents` — file metadata (name, mime, hash, retention category, uploader)
- `document_attachments` — polymorphic links to bills, invoices, JEs, fixed assets, etc.

## Permissions

### `users`, `user_roles`, `entity_permissions`

- `users` — auth-linked, profile data
- `roles` — Admin, Controller, Bookkeeper, Approver, Read-only, etc.
- `entity_permissions` — per-user, per-entity role assignments

Permission checks happen in middleware / querysets. Default-deny on entity scoping; users only see entities they're assigned to.

## Indexes (high-priority)

- `journal_lines (account_id, journal_entry_id)` for account ledger
- `journal_entries (entity_id, entry_date)` for period reporting
- `journal_entries (period_id, status)` for close logic
- `journal_entries (intercompany_pair_id)` for intercompany matching
- `bank_transactions (bank_account_id, transaction_date, status)`
- `audit_log (table_name, record_id, occurred_at)`
- `fx_rates (from_currency, to_currency, effective_date)`
- `consolidation_mapping (entity_id, account_id, effective_from, effective_to)`

## DB-level invariants checklist

When schema is implemented, this must all be true:

- [ ] Trigger: `journal_entries` balance check on INSERT/UPDATE of `journal_lines` (transaction currency)
- [ ] Trigger: functional_amount balance check
- [ ] Trigger: reject UPDATE/DELETE on posted `journal_entries` (except `reversed_by_entry_id`)
- [ ] Trigger: reject INSERT on `journal_lines` where parent entry's status = 'posted'
- [ ] Trigger: reject INSERT/UPDATE on `journal_entries` where target period status != 'open'
- [ ] Trigger: reject UPDATE/DELETE on `audit_log`
- [ ] Trigger: audit_log INSERT on every mutation of financial tables
- [ ] Constraint: `accounts` postable/non-postable consistency
- [ ] Constraint: `journal_lines` exactly-one-of(debit, credit)
- [ ] Constraint: `periods` non-overlapping within entity (per period_type)
- [ ] Constraint: `entity_ownership` no cycles
- [ ] Constraint: `entity_ownership` ownership sums ≤ 100% at any effective date
- [ ] Constraint: journal_lines.account belongs to journal_entry.entity
- [ ] Constraint: intercompany pairs match in absolute amount

## What is NOT in this model (v1)

- Time entry (Phase 2)
- Crypto / digital assets
- Payroll detail (integrate later)
- Tax provision detail (external)
- Budget / forecast tables (later)
- Trust / beneficiary tables (not in scope)
