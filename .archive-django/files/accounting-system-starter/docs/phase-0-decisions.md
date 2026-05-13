# Phase 0 — Decisions Locked

All 17 Phase 0 decisions have been resolved through structured discussion. This document records the decisions, rationale, and implications. Changes after this point require explicit amendment and re-review.

**Date locked:** [fill in when signed off]
**Owner:** Adam
**Reviewed by:** [add names]

---

## 1. Entity scope

**Decision:** Multi-entity from v1. 16-50 corporate entities. Entities span 11 jurisdictions: BVI, US, UY, UK, CH, HK, NZ, UAE, SG, ES, IT. Currently running on Microsoft Dynamics 365 Business Central with country-specific localizations.

**Rationale:** Multiple legal entities exist today across multiple jurisdictions. Retrofitting multi-entity later would be extremely costly. Multi-entity from day one is harder than single-entity but trivially harder than retrofitting.

**Implications:**
- All financial tables scoped by `entity_id`
- Permission model is entity-scoped (row-level)
- Reporting supports per-entity, sub-consolidated, and fully consolidated views
- **Entity `jurisdiction` field** drives which localization module applies (see `docs/localization.md`)
- **v1 builds only the US localization.** Other jurisdictions remain on Business Central until their modules are built — see localization architecture for the phased plan.

---

## 2. Entity structure

**Decision:** Multi-tier (holdcos owning holdcos owning opcos). Full consolidated reporting required.

**Rationale:** Reflects actual corporate structure.

**Implications:**
- `entity_ownership` table tracks parent/child relationships with ownership percentages and effective dates
- Consolidation requires:
  - Intercompany transaction matching (both sides agree)
  - Elimination entries at consolidation level (not entity books)
  - Minority interest / non-controlling interest handling
  - Multi-tier rollup logic
- Reporting at entity level, sub-consolidated level (any node in the tree), and fully consolidated level

---

## 3. Functional currency

**Decision:** Multi-currency from v1, multiple functional currencies across entities.

**Rationale:** Some entities operate in non-USD currencies; consolidation requires translation.

**Implications:**
- Currency code on every monetary field
- FX rate table with effective dates (daily rates minimum)
- Per-entity functional currency setting
- Three currency concepts modeled: transaction, functional, reporting
- Remeasurement of foreign-currency-denominated monetary balances at period end (FX gain/loss to income)
- Translation of foreign-functional-currency entities for consolidation per ASC 830:
  - Assets/liabilities at current rate
  - Income/expense at average rate
  - Equity at historical rate
  - CTA (Cumulative Translation Adjustment) flows to OCI
- Rate source: TBD (xe.com, OANDA, Federal Reserve H.10, or similar)

---

## 4. Crypto / digital assets

**Decision:** No crypto holdings in any entity. Out of v1 scope.

**Rationale:** Simplifies data model and avoids ASC 350-60 / ASU 2023-08 fair-value mechanics.

**Implications:**
- No fair-value pricing oracle integration
- No lot-level cost basis tracking for digital assets
- Can be added as a v2 module if needed

---

## 5. Accounting basis

**Decision:** Mixed basis — predominantly modified cash, with full accrual at entity level only where required for audit (specifically deferred revenue and related items). Consolidated reporting normalizes to a simplified basis with consolidation-layer adjustments handling the differences.

**Rationale:** Reflects pragmatic reality — most entities don't need full accrual; a few do for audit; the group view simplifies back.

**Implications:**
- Per-entity `accounting_basis` field (`cash`, `modified_cash`, `accrual`)
- Per-entity flags for which accrual elements that entity uses (e.g., `tracks_deferred_revenue`, `tracks_prepaids_amortization`)
- Consolidation-layer adjustments as a first-class concept (a "consolidation layer" living above entity books for basis-normalization entries)
- Entity-level books remain audit-ready for the audited entities
- Auditor relationship: Adam (former auditor) handles directly; audit firm not engaged in the build process, but outputs must satisfy audit firm format expectations
- Reporting supports both "as recorded" and "as consolidated" views from the same source data

---

## 6. Fiscal year

**Decision:** Mixed fiscal year-ends across entities.

**Rationale:** Different entities have different fiscal calendars.

**Implications:**
- `fiscal_year_end` (month + day) per entity
- Periods scoped per entity, not globally
- Consolidation requires a "reporting date" concept that maps each entity's nearest closed period to the consolidation cutoff
- Year-end closing entries fire per entity, not globally
- Reports support both "entity fiscal year" view and "consolidation period" view
- Practical convention: align consolidations to the parent / group year-end; entities with off-cycle year-ends use stub periods or 93-day-window convention

---

## 7. Reporting outputs (v1)

**Decision:** Comprehensive — standard financials per entity + custom management reports + consolidated financials with eliminations + lender/audit support schedules (PBC packages) + interactive dashboards / KPIs. PDF + Excel export essential.

**Rationale:** All of these are real requirements; no point deferring core reporting.

**Implications:**
- Reporting engine is ~40-50% of v1 build effort
- Built in layers: core financials in v0.5; PBC packages and dashboards in v0.6/v0.7
- PBC packages: GL detail, account roll-forwards, AP/AR aging, fixed asset schedules, bank rec summaries, accrual schedules, intercompany matrices, depreciation rollforward, etc.
- Dashboards: react-based interactive views with drill-down to source transactions
- Multi-currency translation at report time
- Multi-basis presentation (as-recorded vs. consolidated)
- Date ranges, comparison periods, period vs. YTD vs. trailing-12, drill-down

---

## 8. Chart of accounts structure

**Decision:** Option B — per-entity CoA with consolidation mapping layer. Plus dimensions within each entity (department, class, location, project).

**Rationale:** Per-entity CoA preserves entity-level flexibility. Mapping layer handles consolidation. Dimensions handle reporting slices within entities.

**Implications:**
- Each entity has its own `accounts` table scope (independent contents, same schema)
- Separate `consolidation_accounts` table defines group-level chart of accounts
- `consolidation_mapping` table maps `(entity_id, account_id)` to `consolidation_account_id`
- Many-to-one: multiple entity accounts can map to one consolidation line
- Mappings have effective dates (handles reorgs, account renames)
- Reporting engine joins through mapping for consolidated views
- New entity account triggers a "needs mapping" UI flag
- Dimensions: `dimensions` table (configurable per entity since CoA is per-entity)
- Every journal line carries optional dimension values
- Dimensions need consolidation-level mappings if slicing consolidated reports by them

---

## 9. Historical data migration

**Decision:** Opening balances only at cutover date.

**Rationale:** Cleanest cutover. Old system retains historical lookup.

**Implications:**
- Closing trial balance from old system becomes opening journal entries in new system, per entity
- One opening JE per entity at the cutover date
- Old system access strategy: deferred decision (revisit at Phase 5 / parallel run)

---

## 10. Document retention

**Decision:** Permanent retention for some categories, 7 years for others. Documents (invoices, receipts, contracts) attached inline to transactions.

**Rationale:** Standard best practice. Inline attachments support audit and daily workflow.

**Implications:**
- `documents` table with full metadata (filename, mime type, uploader, upload date, SHA-256 hash, retention category, retention expires)
- Polymorphic attachment model — documents attach to bills, invoices, journal entries, fixed assets, bank transactions, reconciliations, contracts, entity records
- Storage: S3-compatible (Cloudflare R2 preferred)
- Retention categories defined:
  - `tax_supporting` = 7 years
  - `fixed_asset` = life-of-asset + 7 years
  - `corporate_governance` = permanent
  - `payroll` = 7 years
  - `contract` = life-of-contract + 7 years
- Retention enforcement: scheduled job flags expired documents for review; destruction is reviewed action with audit log entry (no auto-delete)
- File hashes detect tampering
- Documents are immutable: replace = new version + audit trail

---

## 11. Bank feed strategy

**Decision:** Mix — Plaid for most accounts, manual import for accounts Plaid doesn't cover well. 30-100 bank accounts total.

**Rationale:** Right balance of automation and pragmatism at this scale.

**Implications:**
- `bank_connections` table abstracts over connection method (`plaid`, `direct_api`, `manual`)
- Plaid integration: webhook ingestion, account/transaction sync, balance polling, error handling
- Manual import fallback: CSV / OFX / QFX parsers
- Mercury direct API connector worth considering (clean API)
- Transaction normalization layer — common shape regardless of source
- Duplicate detection (Plaid re-sends or re-IDs transactions occasionally)
- Pending vs. posted handling (ignore pending until cleared)
- Reconciliation workflow handles all sources identically
- Budget 2-5 hours/month ongoing for Plaid connection maintenance

---

## 12. Other integrations

**Decision:**
- Payroll: no integration (manual GL summary entry)
- Corporate cards: Ramp + American Express, light integration (treated like bank feeds)
- AP automation, AR processor, QuickBooks sync, custom systems: none in v1

**Rationale:** Defer integrations aggressively. Core ledger first.

**Implications:**
- Ramp: REST API integration, pulls transactions and balances
- Amex direct API is restricted; likely via Plaid (Amex business products are supported by Plaid)
- Corporate cards modeled as a type of bank account
- Transactions land in `bank_transactions`, reconciliation works the same way
- Spend UX (receipts, categorization, employee swipes) stays in Ramp / Amex apps
- Monthly journal entries: Dr expense accounts (categorized), Cr corporate card liability; paid down separately when statement clears

---

## 13. Users and access

**Decision:**
- 6-15 power users (accounting team)
- ~75 limited-scope users (deferred to Phase 2 — see #14 below)
- SSO required from v1 (Google Workspace / Microsoft / Okta)

**Rationale:** Realistic user picture. SSO from day one avoids painful migration later.

**Implications:**
- WorkOS recommended for SSO (B2B-focused, SAML + SCIM, fair pricing)
- Alternative: Clerk or Auth0
- Roles needed (initial set):
  - Admin: full system access, user management, configuration
  - Controller: full accounting access; approve, post, close
  - Bookkeeper: create/edit drafts, no posting on own work
  - Approver: approve bills, expenses, JEs within scope
  - Read-only / Auditor: read all, modify none
  - (Phase 2) Time entry user, Bill viewer
- Permissions are entity-scoped (someone might be Controller for entity A but Read-only for entity B)
- MFA required for all users from v1

---

## 14. Time entry

**Decision:** Build time entry into the accounting system, but deferred to Phase 2 (post-v1 cutover).

**Rationale:** Time entry is a real module (4-6 weeks of work). Deferring keeps v1 focused on core GL, AP, banking, fixed assets, reporting, consolidation. Time entry as its own milestone after v1 stabilization.

**Implications:**
- v1 scope simpler and faster to ship
- Phase 2 plan: `projects`, `tasks`, `time_entries`, submission/approval workflows
- Mobile-friendly UI for the 75 users
- Integration to GL via: internal cost allocations, billable time to invoices, payroll allocation
- Permission scoping critical (time entry users see only their own data)

---

## 15. Uptime and recovery

**Decision:**
- Uptime: 99.9% during month-end close, 99% otherwise
- Backups: 2x daily snapshots, 7 daily retained, 4 weekly, 12 monthly, indefinite yearly
- DR: cold restore acceptable for v1; revisit if month-end pain emerges

**Rationale:** Realistic for an internal accounting system at this scale. GFS retention matches the document retention policy.

**Implications:**
- Managed Postgres with PITR (7-day window standard)
- Scheduled `pg_dump` jobs producing twice-daily logical backups to R2 (or similar)
- Lifecycle rules on backup store implement GFS retention:
  - Dailies expire at 7 days
  - Weeklies expire at 4 weeks
  - Monthlies expire at 12 months
  - Yearlies promoted to cold archive (R2 cold tier / Glacier) with no expiration
- Backup restore tests: quarterly minimum. A backup never restored is a hope, not a backup.
- Off-region copy for yearly archives (geographic diversity for permanent retention)
- Cold restore plan documented with target 4-24 hour recovery
- Upgrade path: add warm standby (~$200-400/month) if month-end ops prove sensitive
- Estimated backup storage cost: under $50/month even with infinite yearlies

---

## 16. Succession / bus factor

**Decision:**
- Strategy: mainstream open-source stack, well-documented, picked up by any competent engineer
- Repo location: company-owned GitHub Organization, multiple admins
- Documentation: important but not critical — handoff-ready

**Rationale:** Standard answer for "what if Adam isn't available." Auditors will ask; this is the answer.

**Implications:**
- Stack stays boring: Django + Postgres + standard Python ecosystem
- No exotic dependencies. Prefer "boring tech" over "interesting tech."
- GitHub Organization owned by an operating entity (not Adam personally) — set up before first commit
- At least 2 org admins
- `docs/` is a real artifact: ADRs, business rules with citations, runbooks
- Type hints everywhere; mypy strict on financial modules
- Goal: competent Django dev with accounting fluency productive in 2-4 weeks of reading
- Operational runbooks: period close, year close, backup restore, adding entity, onboarding user, Plaid reconnect, etc.
- Yearly backup escrow at separate provider (e.g., S3 / Backblaze if primary is R2) — cheap insurance against provider-level failures

---

## 17. Budget envelope and cutover

**Budget decision:**
- Build phase: under $10K (excluding Adam's time)
- Year 1 ops: under $500/month target
- Adam's time: 50%+ part-time effort

**Honest tradeoffs:**

Build budget:
- AI tools, hosting during build, misc tooling: ~$3-4K
- Pen test: a proper third-party pen test ($10-15K) blows the budget alone. Decision: defer formal pen test to year 2. Internal security review at launch. Lean on managed services' security posture rather than custom infra.

Year 1 ops realistic numbers:
- Managed Postgres: $70-150
- App hosting: $50-100
- WorkOS SSO: $0-125 (free tier may suffice initially)
- R2 backup storage: $20-40
- Sentry / monitoring: $30-80
- Email: $10-30
- Plaid: $30-60
- AI coding tools: $200 (may shift to personal expense post-launch)
- Realistic: $600-900/month. Tight at $500.
- Path to $500: defer WorkOS premium 6-12 months (use Django allauth + Google OAuth + MFA initially), aggressive Plaid cost control.

Time:
- 50%+ = ~20-25 hours/week
- Realistic for 12-18 month build
- Largest "cost" of the project
- Reduces bandwidth for other ventures during build phase

**Cutover decision:**
- Minimum bar: 3 months parallel run with zero unexplained variance
- Timing: calendar year boundary (Dec 31)
- Approach: phased — pilot with 1-3 simple entities first, then waves

**Timeline (rough):**
- Build serious start: early 2026
- v1 ready for pilot: mid-2026
- Pilot entities parallel run: mid-to-late 2026
- Pilot cutover: Dec 31, 2026
- Wave 2-3 entities: parallel through 2027, cutover at clean boundaries
- Total program: 12-24 months

---

## Sign-off

Decisions in this document have been reviewed and approved by:

| Role | Name | Date |
|------|------|------|
| Project owner / builder | Adam | |
| CPA / accounting reviewer (if any) | | |
| Board / management rep (if any) | | |

Changes after sign-off require documented amendment and re-review of the affected decisions.

---

## Decisions deliberately deferred

These were considered and explicitly pushed to later:

1. Time entry module — Phase 2 (post v1 cutover)
2. Crypto / digital asset support — v2 if/when needed
3. Old system access strategy post-cutover — revisit at Phase 5 (parallel run start)
4. Formal pen test — year 2
5. Warm standby DR — upgrade if cold restore proves insufficient
6. WorkOS premium tier — defer 6-12 months, use Google OAuth + MFA initially
7. AR / Stripe / payment processor integration — v2+
8. Payroll integration — possibly never; manual GL summary entry is fine
9. Multi-tenant SaaS extraction — never (single-org system)

---

## Post-Phase-0 addendum decisions

These were locked after the initial Phase 0 walkthrough as design and scope details became clearer:

### Design language (locked)

Modern SaaS aesthetic with persistent left sidebar. Reference points: Sage Intacct, Linear, Mercury. See `docs/design.md` for full specification.

### Interface languages (locked)

English and **Uruguayan Spanish (es-UY)** supported from v1, via Django's `gettext` framework. UI strings, number/date formatting (comma decimal, period thousand, dd/mm/yyyy dates), and report output all locale-aware. Master data (account names, entity names, descriptions) remains in the language entered — no auto-translation of user-entered data. Uruguay-specific accounting terminology (e.g., "estado de situación patrimonial", "balance de saldos", "amortización" for both depreciation and amortization) is locked in the glossary. v1 ships with the i18n framework wired but only English strings translated; Spanish UY strings ship with v2 (Uruguay localization). See `docs/i18n.md` for full specification.

### Localization architecture (locked)

The group operates entities across 11 jurisdictions: BVI, US, UY, UK, CH, HK, NZ, UAE, SG, ES, IT. The system architecture uses a **core engine + pluggable per-jurisdiction localization modules** pattern (same approach as Business Central, NetSuite OneWorld, Sage Intacct global).

- **v1 = core engine + US localization module.** Pilot is US-domiciled.
- Non-US entities remain on Business Central until their localization module is built and parallel-run is clean.
- Future modules in approximate priority order: UY → UK → ES → IT → HK → SG → CH → UAE → NZ → BVI.
- Each module: 2-6 weeks of build effort (e-invoicing jurisdictions at the higher end).
- Core engine MUST NOT reference any specific jurisdiction in code.

See `docs/localization.md` for full architectural specification, module interface, and migration plan.
