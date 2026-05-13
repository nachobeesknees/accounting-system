# Phase 6 Deployment Schedule

## Deployment Cadence
- **Daily deployments** to staging (Fly.io)
- **Daily review briefing** (this document updates, GitHub release notes)
- **Weekly demos** (optional video walkthrough)
- **Code always production-ready** (no WIP merges)

## Current Status
- Phase 6 Start: 2026-05-12
- Target Phase 6 Complete: 2026-05-26 (2 weeks)
- Target Phase 7 (UI): 2026-06-09 (4 weeks)

## Today's Deployments

### Deployment 1: Database Setup & Triggers (Day 1)
**Scope:** Postgres migrations + invariant triggers
**Status:** 🔄 In Progress

**What's being deployed:**
- ✅ Apply migrations (Entity, Account, JournalEntry, GL, AuditLog)
- ✅ Postgres triggers for:
  - Double-entry integrity (deferred constraint)
  - Immutability of posted entries
  - Audit log creation
  - Period lock enforcement
- ✅ Health check endpoint
- ✅ Test data fixtures (1 entity, 10 accounts, 5 periods)

**Review Checklist:**
- [ ] `GET /api/auth/health/` returns 200
- [ ] Migrations applied without errors
- [ ] Trigger validation: Double-entry constraint works
- [ ] Trigger validation: Can't update posted entries
- [ ] Audit log shows all changes

---

### Deployment 2: Authentication & Entity Routing (Day 2-3)
**Scope:** Django-allauth + multi-entity context

**What's being deployed:**
- User login (Google OAuth)
- Entity selector middleware
- User entity permissions
- Request context (current_entity, current_user)
- Multi-entity scoping filters

**Review Checklist:**
- [ ] Google OAuth login works
- [ ] Entity selector shows correct entities
- [ ] GL queries filtered by entity_id
- [ ] Permission checks prevent cross-entity access

---

### Deployment 3: Journal Entry API (Day 4-5)
**Scope:** REST endpoints for journal entry workflow

**What's being deployed:**
```
POST   /api/finance/entries/              # Create draft
GET    /api/finance/entries/{id}/         # View entry
PUT    /api/finance/entries/{id}/         # Update draft only
POST   /api/finance/entries/{id}/post/    # Post (immutable after)
POST   /api/finance/entries/{id}/reverse/ # Reverse posted entry
GET    /api/finance/entries/              # List (paginated, entity-scoped)
```

**Review Checklist:**
- [ ] Create draft entry with 2+ lines
- [ ] Update draft (changes allowed)
- [ ] Post entry (becomes immutable)
- [ ] Try to update posted entry (fails)
- [ ] Reverse posted entry (creates reversal)
- [ ] Audit log shows all operations
- [ ] Double-entry constraint enforced

---

### Deployment 4: Chart of Accounts API (Day 6)
**Scope:** CoA management & validation

**What's being deployed:**
```
GET    /api/finance/accounts/             # List CoA
POST   /api/finance/accounts/             # Create account (admin only)
GET    /api/finance/accounts/{id}/        # View account
PUT    /api/finance/accounts/{id}/        # Update account rules
POST   /api/finance/accounts/{id}/toggle/ # Activate/deactivate
```

**Review Checklist:**
- [ ] CoA loads with correct accounts
- [ ] Account hierarchy renders correctly
- [ ] Deactivated accounts don't allow posting
- [ ] 1099 accounts show correct flags

---

### Deployment 5: FX Rates & Periods (Day 7)
**Scope:** Foreign exchange rate upload, period management

**What's being deployed:**
```
POST   /api/finance/fx-rates/upload/      # Upload CSV (admin)
GET    /api/finance/fx-rates/             # List rates
GET    /api/finance/periods/              # List periods
POST   /api/finance/periods/              # Create period (admin)
POST   /api/finance/periods/{id}/close/   # Close period
```

**Review Checklist:**
- [ ] Upload FX rates CSV
- [ ] Rates appear in DB with correct precision
- [ ] Journal entry uses correct rate (effective date)
- [ ] Can't post to closed period
- [ ] FX conversions work end-to-end

---

### Deployment 6: GL Query & Reports (Day 8)
**Scope:** General ledger read API + basic reports

**What's being deployed:**
```
GET    /api/finance/gl/                   # GL entries (paginated, entity-scoped)
GET    /api/finance/trial-balance/        # Trial balance per period
GET    /api/finance/account/{id}/detail/  # Account detail (all entries)
GET    /api/finance/entity/{id}/balance/  # Entity balance sheet snapshot
```

**Review Checklist:**
- [ ] GL query returns correct balances
- [ ] Trial balance debits = credits
- [ ] Multi-currency accounts show functional amount
- [ ] Pagination works (1000+ entries)

---

## Review Format

Each deployment includes:
1. **GitHub Release Notes** (auto-generated from commits)
2. **Staging URL** (live endpoint for testing)
3. **Test Results** (pytest output, coverage change)
4. **Checklist** (above — mark as reviewed)
5. **Known Issues** (blockers for next phase)

## Deployment Process

```bash
# Every evening:
git add -A
git commit -m "Phase 6 Day N: <scope>"
git push origin main

# GitHub Actions runs:
1. pytest (600 tests)
2. mypy (strict on finance)
3. Build Docker image
4. Deploy to Fly.io staging
5. Post GitHub release with checklist

# You review overnight and confirm:
# ✅ Checklist or 🔴 Blocker
```

## How to Review

**Each day you'll get:**
1. **Slack notification** (if configured) or GitHub email
2. **Staging URL:** https://accounting-system-staging.fly.dev
3. **Test command** (run locally if you want):
   ```bash
   pytest apps/finance/tests/ --cov
   ```
4. **Commit link** (view what changed)
5. **Checklist** (copy-paste above, mark items)

**Minimum review:** 10 minutes per day
- Skim GitHub commit diff
- Check test results (green/red)
- Mark checklist items as reviewed
- Note blockers in GitHub issue

---

## Milestones

- **May 19 (Week 1):** Deployments 1-3 complete (journal entry API working)
- **May 26 (Week 2):** Deployments 4-6 complete (GL + reports working)
- **June 2 (Week 3):** Consolidation API integration + bank recon API
- **June 9 (Week 4):** API complete, ready for UI layer

---

## Rollback Plan

If a deployment has blockers:
1. Identify blocker in GitHub issue
2. I revert commit
3. Fix locally
4. Re-deploy next day
5. No manual intervention needed

All migrations are reversible. All data is in staging only (safe to delete and restart).
