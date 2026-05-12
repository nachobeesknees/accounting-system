# Roadmap

Phased build plan reflecting Phase 0 decisions. Realistic for solo + AI tools given the multi-entity, multi-currency, consolidation scope.

## Phase 0 — Decisions ✅

**Status:** Complete. See `docs/phase-0-decisions.md`.

## Phase 1 — Discovery & requirements (3-4 weeks)

**Goal:** Document current-state workflows, target-state workflows, and required outputs in enough detail to design against.

- Map every monthly workflow currently performed (per entity type)
- Inventory all current-system reports actually used
- Collect samples of every required output (financials, mgmt reports, PBC packages, dashboards)
- Inventory all 16-50 entities: type, jurisdiction, functional currency, fiscal year, basis
- Inventory all bank accounts (institution, account type, currency, entity)
- Inventory all ownership relationships (parent → child, percentages)
- Catalog edge cases that have caused pain historically
- Define dimension taxonomy per entity (departments, classes, locations, projects)
- Identify pilot entities (1-3 simple ones for cutover wave 1)

**Deliverables:** Requirements doc, workflow diagrams, entity master, sample reports archive.

## Phase 2 — Architecture (2 weeks)

**Goal:** Confirm stack, hosting, security model, and high-level system architecture.

- Confirm Django + Postgres + HTMX stack
- Confirm Tailwind + design language per `docs/design.md`
- Confirm Django i18n setup with English + Spanish per `docs/i18n.md`
- **Confirm core engine + localization module architecture per `docs/localization.md`. Set up `apps/localization/` directory with registry pattern. US module skeleton.**
- Choose hosting provider; provision dev/staging/prod environments
- Document threat model
- Document deployment topology
- Document secrets management approach
- Document audit log architecture (DB triggers)
- Document backup and DR plan with GFS retention
- Document SSO strategy (Google OAuth for v1, WorkOS later)
- ADRs (Architecture Decision Records) for each major decision

**Deliverable:** Architecture doc + ADRs in `docs/decisions/`.

## Phase 3 — Data model (3 weeks, can overlap Phase 2)

**Goal:** Implement schema with all invariants enforced at DB level. Multi-entity, multi-currency, consolidation-aware. No business logic yet.

- Implement core tables per `docs/data-model.md`
- DB triggers for double-entry balance (transaction AND functional currency)
- DB triggers for posted-entry immutability
- DB triggers for period status enforcement
- DB triggers for audit log on every financial table
- Entity ownership with no-cycles constraint
- Per-entity CoA with consolidation mapping infrastructure
- FX rate table with effective dates
- Comprehensive invariant test suite (Hypothesis property-based)

**Gate:** All DB-level invariants verified. No unbalanced entries. No edits to posted entries. No cycles in ownership.

## Phase 4 — MVP build (5-7 months solo + AI)

Strict scope. AI compression is real but not magical at this complexity.

### v0.1 — Foundations (month 1-2)

- Multi-entity setup with ownership relationships
- Per-entity CoA management
- Consolidation account master and mapping
- Dimension setup per entity
- FX rate management (manual entry from a source like xe.com or OANDA initially; auto-fetch later)
- Manual journal entry with currency-aware UI (transaction currency + functional translation)
- Trial balance per entity (transaction currency AND functional currency views)
- Period management (create, close, lock) per entity
- Basic P&L and balance sheet per entity
- User management with roles and entity-scoped permissions
- SSO via Google OAuth + MFA
- **Design system foundations:** sidebar shell, table component, money input, account selector, entity switcher, Cmd-K palette (per `docs/design.md`)
- **i18n foundations:** Django translation framework set up, `gettext` wiring, language toggle in settings, initial Spanish translations of base UI strings (per `docs/i18n.md`)
- **Localization registry + US module:** the registry pattern from `docs/localization.md`, plus a working US localization module with US CoA template, 1099 categorization, and US locale formatting

**Gate:** Can manually book transactions across entities/currencies, close a period, generate basic entity-level financials.

### v0.2 — Accounts Payable (month 3)

- Vendor master (with multi-entity linkage)
- Bill entry with approval workflow
- Payment recording (manual)
- AP aging report per entity
- 1099-relevant data capture
- FX handling on AP balances

**Gate:** AP subledger ties to GL for each entity.

### v0.3 — Banking and corporate cards (month 4)

- Bank account setup with GL account linkage
- Plaid integration (Item connection, transaction sync, balance polling, error handling)
- Manual CSV/OFX import for non-Plaid accounts
- Ramp API integration for corporate cards
- Corporate cards modeled as bank accounts
- Bank reconciliation workflow with outstanding items
- Multi-currency reconciliation handling

**Gate:** Can complete clean reconciliations for a test month across bank and card accounts in multiple currencies.

### v0.4 — AR, intercompany, system entries (month 5)

- Customer master
- Invoice entry
- Payment application
- AR aging
- Intercompany transaction modeling with paired entries
- Intercompany matching report
- Recurring journal entries
- Scheduled accruals
- FX remeasurement of monetary balances at period-end

**Gate:** AR ties to GL; intercompany entries pair correctly; period-end FX remeasurement works.

### v0.5 — Close, consolidation, core reporting (month 6-7)

- Full period close workflow with checklist per entity
- Year-end close with closing entries
- Fixed assets and depreciation
- **Consolidation engine**: translation, eliminations, basis adjustments, NCI
- Consolidation run management (`consolidation_runs` and `consolidation_adjustments`)
- Standard reports: P&L, balance sheet, cash flow, trial balance
- Reports with comparison periods, drill-down to source transactions
- Entity-level + sub-consolidated + fully consolidated views
- Multi-currency report translation
- PDF + Excel export

**Gate:** Can produce a full month-end close package for any entity AND consolidated financials across the group.

### v0.6 — PBC packages, dashboards, polish (month 7-8)

- PBC schedules: GL detail, account roll-forwards, aging schedules, fixed asset rollforwards, bank rec summaries, accrual schedules, intercompany matrices
- Interactive dashboards with KPIs and drill-down
- Historical balance import tooling (for opening balances at cutover)
- Audit trail extract reports
- Performance optimization
- Documentation for users
- Training materials
- Monitoring, alerting, error tracking
- Internal security review

**Gate:** All P0/P1 bugs closed. System is good enough to run alongside production for pilot entities.

## Phase 5 — Pilot parallel run (3 months)

**Goal:** Run new system alongside existing system for 1-3 simple pilot entities. Book every transaction in both. Reconcile trial balances monthly.

- Daily transaction entry in both systems for pilot entities
- Monthly trial balance comparison
- Variance investigation and resolution
- Bug fix cycle
- Workflow refinement based on real use
- Document lessons learned for wave 2-3 rollout

**Gate (per cutover criteria):**
- 3 consecutive months of zero unexplained variance for pilot entities
- DR test successful
- Backup restore test successful
- All training complete

## Phase 6 — Pilot cutover (Dec 31, 2026)

- Cut over pilot entities at calendar year boundary
- Opening balances loaded as opening JE per entity
- Old system goes to read-only mode for pilot entities
- Daily monitoring for 60 days post-cutover
- Hyper-care: rapid response to any issue

## Phase 7 — Wave 2 and 3 (2027)

- Apply lessons from pilot
- Parallel run for additional waves of entities
- Stagger cutovers at clean boundaries (quarter-ends or year-end 2027)
- Each wave informed by previous wave's experience

## Phase 8 — Time entry module (post wave 3 stable)

This is what was originally called "Phase 2" in the Phase 0 decisions:

- `projects` and `tasks` models
- `time_entries` with submission/approval workflow
- Mobile-friendly UI for 75 users
- Integration to GL (internal cost allocations, billable time to invoices)
- Permission scoping for time entry users
- Reports: time by project, person, entity, utilization

Estimated: 4-6 weeks of work, but only starts after the broader system is stable post-cutover.

## Phase 9+ — Localization modules (ongoing)

After v1 stabilizes and US entities are running cleanly, additional jurisdictions are migrated off Business Central one module at a time. See `docs/localization.md` for full architecture.

Approximate priority order (subject to revision based on entity activity, audit pressure, and BC pain points):

| Order | Module | Est. effort | Migration approach |
|---|---|---|---|
| 1 | Uruguay (UY) | 3-4 weeks build + 2-3 months parallel | UYU functional, NIIF/NCA, DGI exports, Libro Diario/Mayor, ships Spanish UY UI strings |
| 2 | UK | 4-5 weeks build + 2-3 months parallel | GBP functional, FRS 102, MTD VAT integration, Companies House iXBRL |
| 3 | Spain (ES) | 5-6 weeks build + 2-3 months parallel | EUR functional, PGC, SII integration, Modelo 303/390 |
| 4 | Italy (IT) | 5-6 weeks build + 2-3 months parallel | EUR functional, OIC, SDI via intermediary, Bilancio CEE |
| 5 | Hong Kong (HK) | 3-4 weeks build + 2 months parallel | HKD functional, HKFRS, profits tax categorization |
| 6 | Singapore (SG) | 3-4 weeks build + 2 months parallel | SGD functional, SFRS, GST, ACRA-aligned reporting |
| 7 | Switzerland (CH) | 4-5 weeks build + 2 months parallel | CHF functional, Swiss GAAP/IFRS, cantonal variation |
| 8 | UAE | 3-4 weeks build + 2 months parallel | AED functional, IFRS, VAT, emerging e-invoicing |
| 9 | New Zealand (NZ) | 3 weeks build + 2 months parallel | NZD functional, NZ IFRS, GST |
| 10 | BVI | 2-3 weeks build + 2 months parallel | USD functional, IFRS-light, economic substance |

Per module:
1. Build localization module
2. Configure module per local conventions (CoA, tax codes)
3. Set up first entity in new system with opening balances from BC
4. Run parallel 2-3 months
5. Cut over at jurisdiction-appropriate fiscal boundary
6. BC instance for that jurisdiction goes read-only

BC continues to be the system of record for non-migrated jurisdictions throughout. No big-bang global cutover.

## Post-launch — Ongoing

Permanent state, not a phase. Plan for:

- ~30% of solo builder time on maintenance
- Regulatory updates (1099 thresholds, FX rate sources, etc.)
- Annual audit support for audited entities
- Quarterly DR tests
- Quarterly backup restore tests
- Annual access review
- Documentation kept current
- New entity onboarding workflow exercised periodically

## What gets added in v2+

Out of v1 scope; deliberately deferred:

- Crypto / digital asset support
- AR processor integration (Stripe etc.)
- Payroll integration (currently manual GL summary)
- AP automation (Bill.com style)
- Budget and variance reporting
- Cash forecasting
- Advanced custom report builder (drag-and-drop)
- Mobile interface for approvals
- Workflow automation expansion
- Fiduciary / trust accounting (major separate project)

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Solo builder unavailable | Low-Med | High | Mainstream stack, company repo, documentation discipline |
| Consolidation complexity blows scope | Med | High | Build engine carefully in v0.5; start consolidating in pilot, not all entities |
| Multi-currency edge cases discovered late | Med | Med | Phase 3 invariant tests cover FX paths; parallel run catches rest |
| Intercompany matching causing close delays | Med | Med | Build matching report early; resolve mismatches as ongoing process |
| Plaid connections instability | High | Low-Med | Manual import as fallback; reconnect UI well-built |
| Pilot reveals workflow gaps | High | Med | That's the point. 3-month parallel buffer absorbs it. |
| Cutover slips past Dec 31, 2026 | Med | Med | Hard gate on cutover criteria; defer to Q1 2027 if needed |
| Underestimate of edge cases per entity | Med | Med | Phased rollout limits blast radius; lessons compound across waves |
| Budget overrun (cash) | Low | Med | Defer pen test, manage Plaid costs, defer WorkOS premium |
| Time commitment exceeds 50% | Med | High | Accept reality, descope features (e.g., dashboards lighter v1) |
| i18n adds more time than estimated | Med | Low-Med | Wire from day one; AI tools handle the mechanical part well; accept some bilingual review time |
| Design system drift across screens | Med | Low | `docs/design.md` referenced in every Claude Code session; component library enforces patterns |
| Jurisdiction-specific logic leaks into core engine | Med | High | Test: core works with no localization modules loaded. Code review for hardcoded country refs. CLAUDE.md rule #18. |
| BC continues running indefinitely (non-US migrations slip) | High | Low-Med | Acceptable. BC is the system of record until a localization module replaces it. No pressure to migrate before ready. |

## Decision log

Maintain ongoing as ADRs in `docs/decisions/`. Every non-trivial decision dated and recorded.
