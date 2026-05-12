# Strategic Development Plan
## Multi-Entity, Multi-Currency Global Accounting System

**Vision:** Production-ready MVP (v0.1) in Phase 4, supporting 16-50 entities, multiple functional currencies, full audit trail, and consolidation by end of Q4 2026.

---

## Phase 1: Foundation (Weeks 1-4)
### Critical Path — Data Model & Core Invariants

**Objectives:**
1. Core financial models locked in (Entity, CoA, JournalEntry, GL)
2. All DB-level invariants enforced (double-entry, immutability, audit)
3. Decimal money math with currency codes throughout
4. Multi-currency transaction & FX translation rules proven in tests
5. Basic auth/user model with entity scoping

**Deliverables:**
- ✅ Django scaffold (done)
- [ ] Entity & user models with multi-entity scoping
- [ ] Chart of accounts with consolidation mapping layer
- [ ] Journal entry model with immutability triggers
- [ ] FX rate table with date-effective rates
- [ ] Audit log trigger system (Postgres)
- [ ] 100+ unit tests for money math + invariants

**Owner:** Core Team  
**Risk:** Getting money math wrong early requires rewrite. Use hypothesis (property-based tests).

---

## Phase 2: Multi-Currency & FX (Weeks 3-6, parallel with Phase 1)
### Critical for Global Operations

**Objectives:**
1. Transaction currency vs functional currency vs reporting currency working correctly
2. FX conversion on transaction posting (transaction-to-functional)
3. Period-end remeasurement of foreign-currency monetary balances
4. ASC 830 consolidation translation rules (current rate / average rate / historical)
5. Audit trail for every FX entry

**Deliverables:**
- [ ] FX rate schema & ingestion pipeline
- [ ] Transaction FX conversion logic (with test coverage for edge cases)
- [ ] Period-end revaluation batch job (Django-Q2)
- [ ] FX gain/loss journal entry generation
- [ ] ASC 830 translation matrix for consolidation
- [ ] Integration tests with 5+ currency pairs

**Owner:** Currency & Translation Team  
**Dependency:** Phase 1 models

---

## Phase 3: Consolidation & Intercompany (Weeks 5-8, parallel)
### Multi-Entity Roll-Up

**Objectives:**
1. Intercompany transaction modeling (paired GL entries in two entities)
2. Intercompany reconciliation & mismatch flagging
3. Consolidation elimination entries (on consolidation layer, not entity books)
4. Full consolidation roll-up (equity, asset, liability, revenue, expense)
5. Sub-consolidation for entity groups (holding co rolls up to parent)
6. Audit trail for all consolidation adjustments

**Deliverables:**
- [ ] Intercompany transaction model
- [ ] Intercompany matching algorithm
- [ ] Consolidation adjustment model & approval chain
- [ ] Consolidation engine (roll-up with translations)
- [ ] Mismatch reporting & dashboard
- [ ] Integration tests with 5-entity pyramid structure

**Owner:** Consolidation Team  
**Dependency:** Phase 1 models + Phase 2 FX

---

## Phase 4: Bank Integrations & Cash (Weeks 6-10, parallel)
### Cash Flow Visibility

**Objectives:**
1. Plaid integration for 30-100 bank accounts
2. Corporate card feeds (Ramp, Amex)
3. Bank reconciliation model (complete state + outstanding items)
4. Auto-matching of GL entries to bank transactions
5. Exception reporting for unmatched items

**Deliverables:**
- [ ] Plaid client & webhook handlers
- [ ] Bank transaction ingestion model
- [ ] Reconciliation state machine
- [ ] Auto-matching rules engine
- [ ] Bank recon dashboard
- [ ] Integration tests with Plaid sandbox

**Owner:** Integration Team  
**Dependency:** Phase 1 models

---

## Phase 5: Localization Framework (Weeks 7-12, parallel)
### Per-Jurisdiction Modules

**Objectives:**
1. Pluggable jurisdiction module architecture
2. US module (GAAP, tax rules, regulatory)
3. Module registration & activation
4. Per-jurisdiction GL account validation
5. Jurisdiction-specific reporting rules

**Deliverables:**
- [ ] Localization module base class & interface
- [ ] US module (GAAP, tax) with rules engine
- [ ] Registry & dynamic loading
- [ ] Jurisdiction rule validation
- [ ] Tests for US + placeholder structure for other 10 jurisdictions

**Owner:** Localization Team  
**Dependency:** Phase 1 models

---

## Phase 6: Admin UI & Dashboards (Weeks 8-14, parallel)
### User Interface

**Objectives:**
1. Modern SaaS UI (left sidebar, Linear/Intacct reference)
2. Entity selector & multi-entity navigation
3. Journal entry create/edit/post workflows
4. Chart of accounts management
5. FX rate upload & validation
6. Consolidation status dashboard
7. Bank recon UI with smart matching

**Deliverables:**
- [ ] Django template base with Tailwind
- [ ] Entity selector + context preservation
- [ ] Journal entry form (line-by-line entry)
- [ ] CoA manager
- [ ] FX rate manager
- [ ] Consolidation dashboard
- [ ] Bank recon UI (React component for drag-drop matching)

**Owner:** UI Team  
**Dependency:** All Phase 1-5 models

---

## Phase 7: Reporting & Export (Weeks 10-16, parallel)
### Financial Statements & PBC

**Objectives:**
1. Per-entity financials (IS, BS, CF)
2. Sub-consolidated financials
3. Fully consolidated financials
4. Custom management reports (by dimension)
5. PBC package generation (pre-formatted for audit)
6. PDF export (WeasyPrint)
7. Excel export with pivot tables (openpyxl)

**Deliverables:**
- [ ] Report builder framework
- [ ] Income statement engine
- [ ] Balance sheet engine
- [ ] Cash flow statement engine
- [ ] Custom report builder (dimensions, filters)
- [ ] PBC package template + generator
- [ ] PDF renderer
- [ ] Excel exporter with formatting

**Owner:** Reporting Team  
**Dependency:** Phases 1-5

---

## Phase 8: Testing & Hardening (Weeks 12-18, parallel ongoing)
### Quality & Stability

**Objectives:**
1. 100% coverage on financial logic
2. Property-based tests on money math (hypothesis)
3. Stress tests (1000s of entities, 100k+ GL entries)
4. Concurrency tests (simultaneous posts to same entity)
5. Disaster recovery tests
6. Audit log verification

**Deliverables:**
- [ ] 2000+ tests (unit + integration)
- [ ] Coverage report (>95% on finance module)
- [ ] Stress test suite
- [ ] Concurrency test suite
- [ ] DR test playbook

**Owner:** QA Team  
**Dependency:** All phases

---

## Deployment & Go-Live
**Target:** December 31, 2026 pilot cutover (3 months parallel run)

- Staging environment in Fly.io by Week 14
- Prod environment by Week 16
- 3-month parallel run with pilot entities
- Waves 2-4 through 2027

---

## Success Metrics (CFO Lens)

| Metric | Target | Why |
|--------|--------|-----|
| **Audit trail completeness** | 100% | Regulatory requirement |
| **FX math accuracy** | ±$0.01 on all conversions | Audit quality |
| **Consolidation timing** | <5 min for 50 entities | Month-end efficiency |
| **Bank recon time** | 1 day vs 3 days (old system) | Cash visibility |
| **Error rate** | <0.1% of transactions | Trust in system |
| **Go-live success** | 100% of 3 pilot entities | Momentum for wave 2 |
| **User adoption** | >80% of 15 users within 30 days | ROI realization |

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Money math errors | High | Critical | Hypothesis tests + audit spot-checks |
| FX conversion bugs | Medium | Critical | Reference implementations, external validation |
| Consolidation complexity | High | High | Modular design, incremental testing |
| Bank feed outages | Medium | Medium | Offline reconciliation fallback |
| Multi-entity scoping bugs | High | Critical | Permission tests on every user action |
| Performance degradation | Medium | Medium | Load testing at 5x expected volume |

---

## Resource Allocation (AI-Driven)

- **Core Model Team:** 1 agent (Phase 1, data model lock)
- **Currency Team:** 1 agent (Phase 2, FX rules)
- **Consolidation Team:** 1 agent (Phase 3, multi-entity roll-up)
- **Integration Team:** 1 agent (Phase 4, bank feeds)
- **Localization Team:** 1 agent (Phase 5, jurisdiction modules)
- **QA/Testing:** 1 agent (ongoing, Phases 1-8)

**Total:** 6 parallel agents running autonomously, coordinating via shared codebase + PR reviews.

---

## Decision Authority

- **Adam Webb (Human CFO):** Strategic decisions, architecture changes, regulatory/compliance trade-offs, go/no-go milestones
- **Agent Leads:** Tactical decisions within phase scope, refactoring, test strategy
- **Shared:** PR review, CLAUDE.md invariant enforcement, documentation updates

All agents operate under CLAUDE.md invariants and cannot violate them.
