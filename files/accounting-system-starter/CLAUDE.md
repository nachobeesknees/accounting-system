# CLAUDE.md — Multi-Entity Corporate Accounting System

This file is read by Claude Code on every session. It defines the project, its non-negotiable invariants, and the working rules. Read it carefully before writing any code.

---

## Project context

In-house corporate accounting system for a group of 16-50 multi-tier legal entities (holdcos owning holdcos owning opcos). Replaces an existing vendor accounting platform.

**Key parameters (locked in Phase 0):**

- **Entity count:** 16-50 entities, multi-tier ownership
- **Currency:** multi-currency with multiple functional currencies (ASC 830 translation rules)
- **Basis:** mixed — predominantly modified cash, full accrual at entity level only where required for audit
- **Fiscal year:** mixed year-ends across entities
- **Chart of accounts:** per-entity CoA with consolidation mapping layer; dimensions (department, class, location, project) within each entity
- **Reporting:** per-entity + sub-consolidated + fully consolidated; standard financials + custom mgmt + PBC packages + dashboards; PDF + Excel export
- **Crypto:** out of scope
- **Users:** 6-15 power users in v1; SSO required from day one
- **Time entry:** Phase 2 (post v1)
- **Bank feeds:** Plaid + manual mix; 30-100 accounts
- **Corporate cards:** Ramp + Amex, light integration (treated as bank feeds)
- **Payroll integration:** none (manual GL summary entries)
- **Uptime:** 99.9% during month-end close, 99% otherwise
- **Backups:** 2x daily, GFS retention (7 daily, 4 weekly, 12 monthly, infinite yearly), cold restore acceptable
- **Cutover:** phased, calendar year boundary, 3 months clean parallel required
- **Design language:** Modern SaaS with left sidebar (see `docs/design.md`)
- **Languages:** English + Uruguayan Spanish (es-UY) i18n framework from v1; Uruguay UI strings ship with v2 (see `docs/i18n.md`)
- **Localization architecture:** core engine + pluggable per-jurisdiction modules (see `docs/localization.md`). v1 = core + US module. Other 10 jurisdictions (BVI, UY, UK, CH, HK, NZ, UAE, SG, ES, IT) added as future modules, migrating off Business Central jurisdiction by jurisdiction.

See `docs/phase-0-decisions.md` for full context on each decision.

The builder is a solo engineer (Adam) working with AI coding tools. Adam is a former auditor; trust accounting and audit firm expectations are handled by Adam directly, not by engaging the audit firm in the build. There is no team. Write for the next maintainer (likely future-you or a successor engineer).

---

## Non-negotiable accounting invariants

These are correctness requirements, not preferences. Violating them is a bug regardless of what the test suite says.

### Double-entry integrity
- Every journal entry MUST have `sum(debits) == sum(credits)`, exactly, at the database level, in the entry's currency.
- Enforced via a Postgres trigger (deferred constraint pattern), NOT in application code.
- No transaction commits a journal entry that violates this. There is no "draft" exception.

### Money math
- All monetary amounts are `Decimal` in Python, `numeric(20, 4)` in Postgres. NEVER `float`. NEVER `Real`. NEVER `Double`.
- Rounding is explicit and uses `Decimal.quantize` with `ROUND_HALF_EVEN` (banker's rounding) unless a specific tax/regulatory rule requires otherwise.
- Currency is stored alongside every amount. Every monetary field has a paired currency.
- Multiplication, division, and FX conversions are done in Decimal context, never in floats.
- FX rates are stored as `numeric(18, 8)` for precision.

### Immutability of posted entries
- A journal entry has a status: `draft`, `posted`, `reversed`.
- Once `posted`, the entry is immutable. No UPDATE statements modify posted entries (except `reversed_by_entry_id` link).
- Corrections to posted entries happen via a NEW reversal entry referencing the original.
- Enforced at the model layer AND with database triggers.

### Period locks
- Accounting periods are scoped per entity. Each entity has its own period calendar.
- Periods have a status: `open`, `closed`, `locked`.
- No journal entry can be posted to a `closed` or `locked` period.
- Reopening a closed period requires an explicit, audited action and is restricted.
- Locked periods cannot be reopened.

### Audit log
- Every INSERT, UPDATE, or DELETE on a financial table writes to an append-only audit log.
- Audit log captures: who, when, what table, what record, before-state, after-state, reason (if provided).
- Audit log is itself immutable — no UPDATE or DELETE on audit_log rows, ever.
- Implemented via Postgres triggers, not application code (application code can be bypassed).

### Multi-entity scoping
- Every financial record carries `entity_id`.
- Cross-entity transactions (intercompany) require explicit modeling — they create paired journal entries in two entities that must agree.
- Row-level permission scoping by `entity_id` is enforced in the application layer for non-admin queries.

### Multi-currency rules
- Every monetary field has an associated currency code (ISO 4217).
- Transaction currency, functional currency (per entity), and reporting currency (per consolidation context) are three distinct concepts. Don't conflate them.
- FX rates have effective dates. Use the rate effective on the transaction date for transaction-to-functional conversion.
- Period-end remeasurement of foreign-currency-denominated monetary balances posts FX gain/loss entries.
- Consolidation translation (ASC 830):
  - Balance sheet at current rate (period-end)
  - Income statement at average rate
  - Equity at historical rate
  - CTA flows to OCI

### Consolidation rules
- Entity books are the source of truth for entity-level financials.
- Consolidation operates on a "consolidation layer" above entity books — adjustments, eliminations, and translations live here, NOT in entity books.
- Intercompany transactions must match on both sides. Mismatches are flagged for resolution before consolidation can complete.
- Eliminations are entries posted to the consolidation layer that reverse intercompany activity.
- Per-entity CoA accounts map to consolidation accounts via the `consolidation_mapping` table. Every new entity account triggers a "needs mapping" flag.

### Segregation of duties (SoD) hooks
- The system supports SoD even though the v1 user count is small.
- A user cannot approve their own journal entry by default. The model enforces this; an override flag exists for documented exceptions.
- Created-by and posted-by are separate fields.
- Approval chains are modeled now, used as user count grows.

### Reconciliation discipline
- Bank reconciliations are first-class objects with beginning balance, ending balance per statement, ending balance per books, matched/unmatched items.
- A reconciliation is `incomplete` until book and statement balances agree (plus outstanding items).
- Corporate cards (Ramp, Amex) reconcile the same way as bank accounts.

---

## Tech stack

Mainstream and boring by design. The successor engineer should already know these technologies.

- **Language:** Python 3.12+
- **Framework:** Django 5.x (admin, auth, ORM, migrations — leverage for solo builder)
- **Database:** PostgreSQL 16+ (only)
- **Frontend:** Django templates + HTMX + Alpine.js for v1. React for specific high-interaction screens (dashboards, recon UI) when needed.
- **Styling:** Tailwind CSS via django-tailwind. See `docs/design.md` for the locked design language (Modern SaaS with left sidebar, Linear/Intacct/Mercury reference points).
- **i18n:** English + Uruguayan Spanish (es-UY) from v1, via Django's `gettext` framework. See `docs/i18n.md`. All user-facing strings wrapped in translation calls.
- **Auth (Phase 0 deferred decision):** Start with django-allauth + Google OAuth + MFA for cost reasons. Migrate to WorkOS when budget allows and / or non-Google SSO is needed.
- **Background jobs:** Django-Q2 (simpler than Celery for solo ops)
- **File storage:** Cloudflare R2 (S3-compatible, cost-effective)
- **Hosting:** Render or Fly.io for app; Neon or Crunchy Bridge for managed Postgres with PITR
- **Testing:** pytest + pytest-django + factory_boy + hypothesis (property-based tests for money math)
- **Linting/formatting:** ruff + mypy (strict mode on `apps/finance/` and other financial modules)
- **Migrations:** Django migrations, reviewed manually, never auto-applied in prod
- **Secrets:** environment variables via direnv locally, platform secrets in prod
- **Monitoring:** Sentry for errors, simple uptime monitoring (UptimeRobot or similar)
- **PDF generation:** WeasyPrint or ReportLab for financial reports
- **Excel generation:** openpyxl

Rationale for Django over FastAPI: solo builder needs scaffolding. Django admin alone saves months. Reconsider only if there's a specific reason.

---

## Working rules for Claude Code

1. **Read this file at the start of every session.** If it's been updated, re-read.

2. **Before writing code in a new domain area, read the relevant doc in `/docs`.** Especially `docs/data-model.md`, `docs/accounting-rules.md`, and `docs/phase-0-decisions.md`.

3. **Never break an invariant to make a test pass.** If a test is asking for a violation, the test is wrong.

4. **Money is always Decimal with a currency code.** If you see `float` anywhere near money, that's a bug. If you see Decimal without currency, that's also a bug (in this multi-currency system).

5. **Write the migration before the model change.** Or use Django's `makemigrations` and review the migration before applying.

6. **Every financial model gets:**
   - `created_at`, `updated_at`, `created_by`, `updated_by`
   - `entity_id` if entity-scoped (almost everything is)
   - Soft delete via `deleted_at`
   - Audit log trigger
   - Tests for the invariants relevant to it

7. **Tests for financial logic use property-based tests where possible.** Hypothesis is installed. Example: "for any set of journal lines that sum to zero in their entry currency, posting succeeds; for any set that doesn't, posting fails."

8. **No new dependencies without justification.** Add a note in `docs/dependencies.md` explaining why.

9. **Commits are small and atomic.** One conceptual change per commit. Commit message format: `area: short imperative summary`.

10. **When uncertain about an accounting rule, STOP and ask.** Do not guess. If a rule isn't in `docs/accounting-rules.md`, it needs to go there before being implemented.

11. **Regulatory and accounting framework references go in `docs/regulatory.md`.** Cite ASC sections, IRS rules, statutes.

12. **Never delete data.** Soft-delete only, with audit log entry. Hard deletes happen via documented retention policy, not ad-hoc.

13. **Performance matters but correctness matters more.** Do not optimize away from invariant checks. The DB-level constraints stay even if they're "slow."

14. **Type hints everywhere. mypy strict on `apps/finance/`.** This is a handoff requirement — the successor engineer reads types.

15. **Document the why, not the what.** Code shows what. Comments and docstrings explain why. Especially for accounting logic — link to ASC sections, point at `docs/accounting-rules.md`.

16. **UI follows the design language in `docs/design.md`.** Sidebar layout, table density rules, color discipline, typography. Don't invent visual patterns per screen.

17. **All user-facing strings go through `gettext`.** No bare strings in templates, views, or models that a user will see. See `docs/i18n.md`. Tests run in both English and Spanish.

18. **Core engine code MUST NOT reference any specific jurisdiction.** No hardcoded country names, tax rates, currency assumptions, or jurisdiction-specific terminology. Anything country-specific lives in `apps.localization.<country_code>`. See `docs/localization.md`. The US module is one module among future peers — not the default.

---

## What this system is NOT

- It is not a fiduciary / trust accounting system. No beneficiary records, no principal/income separation. (Could be a v3 module.)
- It is not a payroll system. Manual GL summary entries from external payroll providers.
- It is not a tax filing system. Tax returns prepared externally.
- It is not a budgeting/FP&A tool. May come later.
- It is not multi-tenant SaaS. Single-org deployment.
- It does not hold crypto / digital assets in v1.
- It does not have time entry in v1 (Phase 2).
- **In v1, it does not yet support non-US jurisdictions.** The 10 non-US jurisdictions in the group (BVI, UY, UK, CH, HK, NZ, UAE, SG, ES, IT) remain on Business Central until their localization modules are built and parallel-run is clean. See `docs/localization.md`.

---

## Definition of done for any feature

A feature is done when:
1. Code is written, reviewed (self-review at minimum), and committed.
2. Tests pass, including invariant tests for any financial logic touched.
3. Migration is applied to local and staging successfully.
4. Audit log entries are generated correctly for the new operations.
5. Documentation is updated (`docs/`, docstrings, ADR if architectural).
6. Manual smoke test on staging.
7. Rollback plan documented if non-trivial.

---

## When something goes wrong

- Production data issue: STOP. Do not "just fix it" in the database. Document, reproduce in staging, write a fix with migration, apply with audit trail.
- Failed migration in prod: roll back via documented procedure. Never edit migrations that have been applied.
- Found an invariant violation in existing data: this is a P0. Stop other work. Investigate, document root cause, write the fix and the prevention.
- Multi-currency math producing odd results: probably a rate-date issue. Check that you're using the rate effective on the transaction date, not today's rate.
- Consolidation not balancing: probably an intercompany mismatch. Run the intercompany reconciliation report.

---

## Open questions / decisions pending

These are deferred or to-be-determined items. Maintain this list; items here block dependent features.

- [ ] FX rate source (xe.com / OANDA / Federal Reserve H.10 / manual)?
- [ ] Final cutover entity selection for pilot (which 1-3 simple entities go first)?
- [ ] Approval chain configuration per entity (who approves what at what threshold)?
- [ ] Old system access strategy post-cutover (decide at Phase 5)?
- [ ] Specific PBC report formats (sample from auditor schedule lists)?
- [ ] Intercompany matching tolerance — exact match or with small variance allowed?
- [ ] Dimension taxonomy — fixed list per entity or free-form?
