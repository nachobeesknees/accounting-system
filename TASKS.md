# Thistlewood ERP — Task Backlog

Agents: read this file before starting work. Check off items as you complete them. Add new items at the bottom of the relevant section with `- [ ]`.

---

## ✅ Completed
- [x] Real Postgres persistence (Neon + Drizzle ORM)
- [x] Client → entity/asset ownership hierarchy
- [x] Annual fees per entity + time tracking (Clockify-style)
- [x] Assets Under Administration (AUA) with market value snapshots
- [x] Bank accounts with signing authority
- [x] Unified contacts (client/vendor/employee/intermediary)
- [x] Per-office price lists with versioning and duplication
- [x] Import/export with smart CSV templates (Settings, admin-only)
- [x] Multi-currency with FX rates and AUA rollup
- [x] Multi-entity accounting with consolidated view
- [x] File attachments everywhere via Vercel Blob
- [x] Production deployment to Vercel (Neon + Blob)
- [x] Regions and groups of regions (schema, admin page, pickers on entity/client/office, list filters)
- [x] Bill-to-client/entity association
- [x] AP Aging (/reports/ap-aging) with funds-in-hand and color coding
- [x] AR Aging (/reports/ar-aging) with employee view toggle
- [x] Invoice notes (append-only log, author + timestamp)
- [x] Expected payment date on invoices
- [x] 12-week rolling cash forecast (/reports/cash-forecast)
- [x] Currency label de-duplication (once per table header)
- [x] Compact number formatting (no cents ≥$1,000; full precision on GL/reconciliation/trial balance/journal)
- [x] Balance sheet fix (prior period comparison)
- [x] Entity detail double-USD fix
- [x] Neon serverless driver (fix for production 500 errors)
- [x] Contact lookup by id OR code
- [x] Smart searchable dropdowns (SmartSelect/Combobox) — `SmartSelect` + `SmartSelectField` at `src/components/ui/SmartSelect.tsx`; typed search, keyboard nav, grouped options, ARIA, portal positioning. Migrated every native `<select>` plus all large-list `SelectField` call-sites (accounts, customers, vendors, entities, contacts, currencies, offices, users, regions, region-groups, employees on AR aging). Small enum fields (status/kind/role/frequency) stay on native `SelectField`.

---

## 🔄 In Progress
- [ ] JE UI redesign — compact spreadsheet-style line items, remove project field, keep department inline
- [ ] Duplicate/clone action on invoices, bills, and journal entries
- [ ] Vendor invoice number rules — prefix/pattern per vendor, auto-suggest next number, duplicate warning

---

## 📋 Pending

### Features
- [ ] Global search upgrade (⌘K) — grouped results by record type, recent searches, full-text search
- [ ] Document OCR — upload PDF/image on any form, call Claude Haiku to extract data and pre-fill fields (needs ANTHROPIC_API_KEY in Vercel env)
- [ ] Payment recommendation/selection tool — select bills to pay on AP aging, show live cash forecast impact, CSV export
- [ ] Real authentication — replace demo/cookie auth with proper login (user accounts, passwords or SSO)
- [ ] Plaid bank account integration (Phase 2) — daily balance sync

### Quality / Polish
- [ ] Full QA pass after each major feature batch
- [ ] Security review of server actions and data access
- [ ] Accessibility audit
- [ ] Mobile responsiveness pass
- [ ] Edge case handling: empty states, error boundaries, loading skeletons everywhere

---

## 📝 Notes for Agents
- Work on `main` branch directly (not worktrees) — commit and push after each feature
- Run `tsc --noEmit` before every commit
- Deploy to Vercel after each logical batch, then smoke test all nav pages + one detail page of each record type (client, entity, invoice, bill, contact, journal entry)
- ANTHROPIC_API_KEY needs to be added to Vercel env vars before OCR feature is deployed
- When a task is done, move it to ✅ Completed and commit the TASKS.md update along with the feature

---
