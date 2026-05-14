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
- [x] Global search upgrade (⌘K) — grouped results by record type, recent searches, full-text search
- [x] Payment recommendation/selection tool — select bills to pay on AP aging, show live cash forecast impact, CSV export
- [x] Smart searchable dropdowns (SmartSelect/Combobox) — `SmartSelect` + `SmartSelectField` at `src/components/ui/SmartSelect.tsx`; typed search, keyboard nav, grouped options, ARIA, portal positioning. Migrated every native `<select>` plus all large-list `SelectField` call-sites (accounts, customers, vendors, entities, contacts, currencies, offices, users, regions, region-groups, employees on AR aging). Small enum fields (status/kind/role/frequency) stay on native `SelectField`.
- [x] Document OCR — upload PDF/image on new invoice/bill/contact/journal forms, Claude Haiku extracts fields and pre-fills the form; raw text saved on the record and indexed by ⌘K
- [x] Period close / lock — `accounting_periods` table (monthly, auto-seeded for current + next year), admin actions on `/settings/periods` (Close / Lock / Reopen-with-reason), warning banner on JE / invoice / bill new forms with `periodOverrideReason` audit field, hard block when locked, dashboard widget showing the last 3 periods + quick-close on the current open period
- [x] Posting controls — AR/AP/Cash direct-posting warnings on the JE form. Inline yellow badge per controlled line + a pre-post confirmation. User can still post; entry is stamped with `bypassControlWarning=true` for the audit trail. Detection via account `subType` AND code-range (1000-1099 cash, 1100-1199 AR, 2000-2099 AP); helper at `src/lib/account-controls.ts`.
- [x] Intercompany + eliminations — per-line "Counterpart entity" picker on JE form marks IC legs; `/reports/intercompany` shows the entity-pair matrix (due-from / due-to / net + reconcile flag); "Generate elimination" button posts a firm-level elimination JE flagged with `eliminationEntryId`. Elimination JEs are EXCLUDED from any single-entity scoped balance sheet / P&L view and INCLUDED at the firm-level consolidated view (standard consolidation accounting). JE detail page surfaces an "Intercompany" / "Elimination" pill and lists counterparts.
- [x] Recurring journal entries — Recurring toggle on the JE form, Templates tab on /journal, "Generate next entry" creates a draft and advances the schedule, "Recurring due" card on the dashboard. Seeded with monthly depreciation + quarterly tax accrual templates.
- [x] Recurring client invoices — "Make recurring" toggle on the new-invoice form (weekly/biweekly/monthly/quarterly/annually), Recurring-templates tab on /invoices, "Generate now" / "Generate next invoice" actions, smart billing-period stamping ("Services: Jan 1 – Jan 31, 2026"), /api/cron/recurring-invoices route for daily Vercel-cron generation, due-template banner on the invoice list.
- [x] Time entries on invoices — "Unbilled time entries" widget on the new-invoice form (filtered to the selected customer), one-line-per-entry or summary-by-staff aggregation, time_entries.invoiceId stamped on save, "Billed" pill linking back to the invoice on /time and a "Billed" filter.

---

## 🔄 In Progress
- [ ] JE UI redesign — compact spreadsheet-style line items, remove project field, keep department inline
- [ ] Vendor invoice number rules — prefix/pattern per vendor, auto-suggest next number, duplicate warning

---

## 📋 Pending

### Features
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
