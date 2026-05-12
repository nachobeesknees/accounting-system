# Pilot Selection — Decisions Locked

This document captures the pilot wave decisions made after Phase 0. The pilot is wave 1 of the phased cutover; getting pilot selection right de-risks the rest of the program.

**Date locked:** [fill in when signed off]
**Owner:** Adam

---

## Summary

The pilot is **one natural audited IC cluster of 2-3 entities**, cutover at Dec 31, 2026, with 3 months of clean parallel run as the gate.

---

## 1. Currency profile

**Decision:** Every entity has some FX activity. No pure-USD entities exist in the portfolio.

**Implication:** Multi-currency machinery (FX rates, transaction-to-functional translation, period-end remeasurement) must be working before pilot starts. No "skip FX in pilot" escape hatch.

## 2. Functional currency for pilot

**Decision:** Pilot entities are USD-functional. Most of the portfolio is USD-functional; the few foreign-functional entities are deferred to later waves.

**Implication:** Pilot exercises FX gain/loss on remeasurement of foreign-currency-denominated monetary balances, but does NOT exercise full ASC 830 translation (CTA, equity at historical, etc.). Translation machinery still needs to work — it just isn't pilot-critical.

## 3. Transaction volume

**Decision:** Volume range across portfolio is wide (under 50 to over 1000/month). Pilot entities should be in the 50-200/month sweet spot.

**Implication:** Pilot entities have meaningful activity but parallel-run discipline remains manageable. Heaviest entities are deferred to later waves.

## 4. Intercompany activity

**Decision:** Most entities have moderate IC (5-20/month). Pilot must select entities that form a natural IC cluster so IC matching is exercised end-to-end within the pilot.

**Implication:** Pilot is not a single isolated entity — it's a cluster. All IC entries within the cluster are tested; IC between pilot and non-pilot entities is handled manually during parallel run.

## 5. Accounting basis on pilot

**Decision:** Pilot the audited IC cluster despite the higher complexity (full accrual + deferred revenue + audit exposure).

**Rationale:**
- Adam is the audit firm's primary contact (former auditor); the optics risk is manageable
- "3 months clean parallel" is an audit-positive story, not negative
- Audited entities are where the accounting machinery matters most; proving the system there gives confidence to scale
- Alternative (piloting simpler non-clustered entities) leaves IC bugs lurking for wave 2

**Implication:** Pilot exercises the full accrual + deferred revenue + IC machinery. Highest learning value. Highest stakes. Acceptable.

## 6. Pilot operator

**Decision:** Adam personally operates the pilot (books transactions in both systems for 3 months, investigates variances).

**Implication and honest flag:**
Combined load during parallel run (Q3-Q4 2026):
- Building (v0.6 polish + pilot-discovered bug fixes): 15-20 hrs/week
- Pilot dual-booking: 5-10 hrs/week
- Variance investigation: 3-5 hrs/week
- Plus existing accounting day-job: unchanged
- Total: 25-40 hrs/week on the system

Mitigations baked in:
- Build variance reconciliation tooling BEFORE parallel run starts (see decision 10)
- Q3-Q4 2026 deliberately quieter on other commitments
- Fallback operator identified in advance (even if not used)

## 7. Transaction type coverage

**Decision:** Pilot cluster exercises all major transaction types — AP bills, bank transactions, payroll allocations, intercompany, accruals, depreciation.

**Implication:** Bugs in any transaction type surface during pilot rather than waiting for later waves. This is the best possible coverage answer.

## 8. Pilot size

**Decision:** 2-3 entities (one natural cluster). Not more, not less.

**Rationale:** Smaller is contained, larger collapses phased rollout into big-bang. Natural cluster boundary matters more than maximizing coverage.

**Implication:** Wave 1 = 2-3 entities. Wave 2 = next 5-10 entities, leveraging lessons from pilot. Wave 3 = the rest.

## 9. Post-cutover fallback

**Decision:** Forward-fix only. Old system goes read-only at cutover.

**Rationale:** If the 3-month parallel run came in clean, rollback shouldn't be needed. Forward-fix discipline forces real solutions.

**Implication:** Parallel-run gate (3 consecutive months of zero unexplained variance) is held strictly. No cutover until the gate is genuinely passed.

## 10. Parallel-run tooling investment

**Decision:** Invest 2-4 weeks of v0.6 specifically on parallel-run tooling — automated variance reports, side-by-side TB comparisons, reconciliation helpers.

**Rationale:** Adam's time is the scarcest resource. Tooling upfront saves hours per week during parallel run. The math favors investment.

**Tooling scope:**
- Nightly automated job: pull old-system TB for pilot entities, compare to new-system TB, produce variance report by account
- Side-by-side transaction listing for any account showing variance
- IC matching report (existing pilot tooling)
- "Reconciliation status" dashboard per pilot entity per month
- Variance investigation workflow (assign, comment, resolve, audit trail)

---

## Pilot selection criteria (final)

The 1 pilot cluster (2-3 entities) is the cluster that best matches:

- ✅ USD-functional
- ✅ Some FX activity, simple profile (1-2 foreign currencies, occasional transactions)
- ✅ 50-200 transactions/month per entity
- ✅ Forms a natural IC cluster (entities transact mostly with each other)
- ✅ Audited entities (accept the higher complexity)
- ✅ Full transaction type coverage (AP, banking, accruals, depreciation, IC)
- ✅ Adam has operational visibility to dual-book

**Action item for Phase 1 Discovery:**
Identify the specific 2-3 entities that meet these criteria. This is a data exercise: walk the entity inventory, score each cluster against the criteria, pick the best match.

---

## Wave 2 and 3 planning (preview)

These decisions are deferred but informed by pilot strategy:

- **Wave 2** (Q1-Q3 2027): the next 5-10 entities. Likely includes other audited clusters, more complex IC patterns, possibly the first foreign-functional entity. Parallel run shorter (2 months) given pilot has validated the system.
- **Wave 3** (Q3-Q4 2027 or 2028): remaining entities. Includes the heaviest-volume entities and any remaining foreign-functional entities. Parallel run may be 1 month or skipped for trivial entities.

Each wave cuts over at a clean boundary (quarter-end or year-end), informed by the previous wave's experience.
