# First Claude Code Sessions

This file is for *you*, not Claude Code. It's a sequence of starter prompts to run, in order, once Phase 0 is signed off. Each prompt makes progress without violating invariants.

## Before the first session

1. ✅ Phase 0 decisions complete (`docs/phase-0-decisions.md`)
2. Create GitHub Organization owned by an operating entity (not personal)
3. Add at least 2 admins to the organization
4. Initialize repository with this starter package
5. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
6. Open project root in terminal
7. Run `claude` to start

## Session 1 — Project bootstrap

```
Read CLAUDE.md, README.md, docs/phase-0-decisions.md, docs/design.md, docs/i18n.md, docs/localization.md, and docs/roadmap.md.

Bootstrap a Django 5 project named `ledger` in this directory. Set up:
- pyproject.toml with uv as the package manager
- ruff and mypy configurations (mypy strict on a future `apps/finance/` module)
- pytest with pytest-django
- factory_boy and hypothesis installed
- Babel installed for locale-aware formatting
- django-tailwind set up for Tailwind CSS
- A .env.example file documenting required environment variables
- A docker-compose.yml for local Postgres 16 (with btree_gist extension enabled)
- Django configured to use Postgres, with database settings reading from env
- A base settings module structure (base / dev / prod splits)
- Django i18n configured: LANGUAGES = [('en', 'English'), ('es-uy', 'Español (Uruguay)')], LOCALE_PATHS set, USE_L10N = True, USE_I18N = True, USE_TZ = True
- Initial locale/ directory structure with placeholder en/es_UY .po files
- Directory structure for the localization registry: `apps/localization/__init__.py` with the registry pattern stubbed (no specific country modules yet — those come in Session 8)
- pre-commit hooks for ruff and mypy

Do NOT create any app or model yet. Just the project skeleton. Show me the plan before executing.
```

## Session 2 — Entities and ownership

```
Read CLAUDE.md and the entities + entity_ownership sections of docs/data-model.md.

Implement the `entities` and `entity_ownership` tables as Django models in a new app called `apps.entities`. Requirements:

- UUID primary keys
- entity model includes: legal_name, dba_name, tax_id (encrypted), entity_type, jurisdiction, fiscal_year_end_month/day, functional_currency, accounting_basis, basis_features (jsonb), active, inception_date, dissolution_date
- entity_ownership: parent_entity_id, child_entity_id, ownership_percent, effective_from, effective_to
- All financial models share an abstract base class with created_at, updated_at, created_by, updated_by, deleted_at
- Validation: no self-ownership, no cycles in ownership graph (use a Postgres trigger or recursive CTE check)
- Validation: ownership percentages summing to a single child at a given effective date <= 100

Write the models, the migration (cycle-check as a database trigger), and tests.

Stop after this. Show me the diff.
```

## Session 3 — Per-entity CoA and consolidation mapping

```
Read CLAUDE.md and the accounts, consolidation_accounts, consolidation_mapping, and dimensions sections of docs/data-model.md.

Implement these tables in a new app `apps.coa`. Requirements:

- accounts table scoped per entity_id
- consolidation_accounts as a separate group-level chart
- consolidation_mapping with effective dates, mapping (entity_id, account_id) -> consolidation_account_id
- dimensions table per entity, supporting department, class, location, project, custom types
- Constraints: (entity_id, code) unique on accounts; non-postable accounts cannot be referenced by journal_lines; etc.
- A "needs mapping" query/manager method that returns entity accounts without active consolidation mappings

Write the models, the migrations, and tests including:
- Cannot make a postable account into a non-postable while it has journal_lines (this will be enforced after journal_lines exists; add the test as a future-check)
- Effective-dated mapping queries return the right mapping for a given as-of date

Stop after this. Show me the diff.
```

## Session 4 — FX rates and currency infrastructure

```
Read CLAUDE.md, the multi-currency section, and the fx_rates section of docs/data-model.md.

Implement the fx_rates table in `apps.fx`. Requirements:

- fx_rates: from_currency, to_currency, rate (numeric 18,8), effective_date, source, rate_type
- Unique on (from_currency, to_currency, effective_date, rate_type)
- A Python service `apps.fx.services.get_rate(from_ccy, to_ccy, on_date, rate_type='spot')` that returns the most recent rate effective on or before the date
- Handle inverse pairs: if USD->EUR exists but EUR->USD doesn't, the service should compute the inverse rather than fail
- A service to translate an amount: `translate(amount, from_ccy, to_ccy, on_date)` returning a Decimal
- Use Decimal throughout. Never float.

Write the models, the services, and tests including:
- Property-based test with hypothesis: round-tripping a translation (A->B then B->A on the same date) should equal the original within rounding tolerance
- A rate not existing on the exact date but existing the day before is found
- No rate at all raises an explicit exception

Stop after this. Show me the diff.
```

## Session 5 — Journal entries with all invariants

```
Read CLAUDE.md, docs/data-model.md (journal_entries, journal_lines), and docs/accounting-rules.md (double-entry, posting, multi-currency sections).

Implement journal_entries and journal_lines in `apps.finance`. CRITICAL requirements:

1. Balance check in TRANSACTION currency: sum(debits) = sum(credits) per entry. Enforced via deferred database trigger.
2. Balance check in FUNCTIONAL currency: sum of functional_amount per entry = 0. Enforced via deferred database trigger.
3. Posted entries are immutable except for reversed_by_entry_id field. Trigger rejects UPDATE/DELETE on posted entries.
4. journal_lines: exactly one of (debit, credit) non-zero, enforced as CHECK constraint.
5. Posting to a non-open period is rejected at the database level.
6. journal_lines.account must belong to journal_entry.entity (cross-entity references rejected).
7. functional_amount is signed (negative for credits), enforced via trigger that derives it from debit/credit at posting time using the FX rate service.

Write the models, the migrations (all triggers in RunSQL migrations), and comprehensive tests:
- Property-based tests with hypothesis proving balanced entries post, unbalanced fail
- Tests that posted entries cannot be modified
- Tests that closed-period entries are rejected
- Tests that cross-entity account references are rejected
- Tests that multi-currency entries balance in both currencies

Stop after this. Show me the migration SQL and test results.
```

## Session 6 — Audit log

```
Read CLAUDE.md and the audit_log section of docs/data-model.md.

Implement audit_log infrastructure in `apps.audit`. Requirements:

1. audit_log table is append-only. Revoke UPDATE and DELETE permissions on it from the application role.
2. A trigger function `audit_log_trigger()` that captures before/after state as JSONB and writes to audit_log on every INSERT/UPDATE/DELETE.
3. Apply the trigger to: entities, entity_ownership, accounts, consolidation_accounts, consolidation_mapping, dimensions, periods, journal_entries, journal_lines, fx_rates.
4. Actor captured from a per-session Postgres GUC `app.current_user_id`, set by Django middleware on every request.
5. Tests prove every mutation creates exactly one audit_log row with correct before/after.

Stop after this. Show me the trigger SQL and middleware code.
```

## Session 7 — Periods

```
Read CLAUDE.md and the periods section of docs/data-model.md.

Implement the periods table in `apps.finance`. Requirements:

- Per-entity period calendar (not global)
- period_type: month, quarter, year, stub
- status: open, closed, locked
- Periods of the same type within an entity cannot overlap (use Postgres exclusion constraint with btree_gist)
- A locked period cannot transition to any other status
- A trigger rejects journal_entries INSERT/UPDATE that target a non-open period
- Service: `apps.finance.services.periods.get_period(entity, date, period_type='month')` returns the matching period

Tests:
- Cannot create overlapping periods
- Cannot post entry to closed period
- Cannot reopen locked period

Stop after this. Show me the diff.
```

## Sessions 8+

By this point the foundation is built. Subsequent sessions implement:

- **Session 8 — Design system + i18n foundations + localization registry:** sidebar shell, table component, money input, account selector, entity switcher, Cmd-K palette, gettext wiring, language toggle, localization registry pattern, US localization module skeleton. Reference `docs/design.md`, `docs/i18n.md`, and `docs/localization.md` extensively.
- v0.1: trial balance + basic financial statements (using the design system from Session 8, US localization active)
- v0.2: AP module (vendors, bills, payments) — US 1099-reportable categorization in the US module
- v0.3: banking + Plaid + Ramp integration + reconciliation
- v0.4: AR + intercompany + recurring entries + FX remeasurement
- v0.5: consolidation engine + reporting
- v0.6: PBC packages + dashboards + polish (including parallel-run tooling per pilot-selection.md) (including parallel-run tooling per pilot-selection.md)

For each new feature:
1. Update or confirm relevant section of `docs/accounting-rules.md` first
2. Reference that section in the prompt to Claude Code
3. Require tests before merge
4. Manual smoke test on staging
5. Update relevant runbook in `docs/runbooks/`

## Working rhythm suggestions

- One feature per branch, one branch per PR (even though you're solo)
- Self-review the diff before merging. Read the migration twice.
- After every Claude Code session, commit. Don't accumulate uncommitted work.
- Run full test suite before pushing.
- Keep `docs/` current. If Claude Code adds behavior, document it.
- Weekly: review `docs/regulatory.md` for any changes
- Monthly: review open questions list in `CLAUDE.md`
- Quarterly: backup restore test, DR test, access review

## When Claude Code drifts

Signs:
- Suggests `float` for money
- Suggests softening a constraint to pass a test
- Suggests editing a posted journal entry in place
- Suggests skipping the audit log "for performance"
- Loses track of entity scoping (queries without entity filter)
- Conflates transaction currency, functional currency, and reporting currency
- Suggests posting consolidation adjustments to entity books
- Hardcodes English strings in templates or code (skips `gettext`)
- Invents new UI patterns instead of using the design system components
- Uses color decoratively (rainbow palettes, semantic colors for non-semantic purposes)
- Puts jurisdiction-specific logic (US tax rates, 1099 rules, USD assumptions, calendar year defaults) in core engine code instead of in `apps/localization/us/`

Response: stop the session, point at the invariant in CLAUDE.md, regenerate. If the drift happens repeatedly on the same point, the invariant probably needs to be louder in CLAUDE.md — go update it.
