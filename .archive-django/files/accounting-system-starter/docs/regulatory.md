# Accounting Frameworks and References

This document lists the accounting frameworks, standards, and references applicable to the system. Populate with citations as decisions are made. Do not implement framework-driven features without a citation here.

## Relevant accounting standards

### Multi-currency (in scope)

- **ASC 830 — Foreign Currency Matters**
  - 830-10: Overall
  - 830-20: Foreign Currency Transactions (transaction-date rate, remeasurement of monetary balances)
  - 830-30: Translation of Financial Statements (consolidation of foreign subs)
  - Key rules implemented:
    - Monetary vs. non-monetary distinction for remeasurement
    - Current rate method for translation (assets/liabilities at current rate, income at average rate, equity at historical)
    - CTA flows to OCI

### Revenue recognition

- **ASC 606 — Revenue from Contracts with Customers** (applies only to entities tracking deferred revenue per Phase 0)
  - Five-step model: identify contract → identify performance obligations → determine transaction price → allocate to obligations → recognize as obligations satisfied
  - System support: deferred revenue mechanics, revenue recognition entries per schedule

### Leases

- **ASC 842 — Leases** (TBD if any entity has lease obligations material enough to require ROU asset / lease liability accounting)
  - If in scope: ROU asset and lease liability on balance sheet, straight-line expense for operating leases, interest + amortization split for finance leases

### Fixed assets

- **ASC 360 — Property, Plant, and Equipment**
  - Capitalization thresholds (typically $1-5K, entity-specific policy)
  - Depreciation methods (straight-line most common; MACRS for tax basis)
  - Impairment testing (rare in scope)

### Consolidation

- **ASC 810 — Consolidation**
  - Voting interest model: consolidate when >50% owned
  - VIE (variable interest entity) model: consolidate when primary beneficiary, regardless of ownership %
  - Non-controlling interest presentation (separate component of equity, separate line in income statement)
  - 93-day window convention for fiscal year-end differences

### Investments

- **ASC 320 — Investments in Debt Securities** (if any entity holds debt securities)
- **ASC 321 — Investments in Equity Securities** (if any entity holds minority equity investments)
- **ASC 323 — Equity Method** (for 20-50% owned investees, not consolidated)

### Crypto

- **ASC 350-60 / ASU 2023-08** — OUT OF SCOPE (no crypto holdings)

### Trust accounting

- **OUT OF SCOPE** — this is not a fiduciary accounting system

## Federal / IRS

- **1099 reporting** — vendor 1099-NEC, 1099-MISC for U.S. entities paying U.S. contractors
  - System needs: vendor flag for 1099-reportable, payment-type categorization, year-end report
- **W-9 collection** — workflow for collecting W-9s from vendors (out of v1 scope; manual)
- **FinCEN BOI** — Beneficial Ownership Information reporting per Corporate Transparency Act (status post-2025 changes TBD; check current state)
- **Information returns** — partnerships file 1065 + K-1s; S-corps file 1120-S + K-1s. System provides data for external prep.

## State / multi-state

- **State income tax** — varies by state; system supplies data for external prep
- **Sales tax** — out of scope for v1 unless any entity has sales tax obligations
- **Franchise tax / annual reports** — out of scope; tracked outside the system

## International

If any entity is non-U.S. (Phase 0 says functional currencies vary, so possible):
- Local GAAP / IFRS may apply
- Local tax authority reporting (out of scope; external)
- Transfer pricing documentation for related-party transactions

## Audit firm requirements

Adam is a former auditor and handles audit firm relationships directly. The system needs to produce outputs that satisfy audit firm expectations:

- **PBC packages** — Prepared By Client schedules
- **GL detail** — full transaction log with drill-down
- **Account roll-forwards** — beginning balance + activity + ending balance per account
- **Subledger ties** — AP aging tying to GL AP balance, etc.
- **Bank rec summaries** — completed reconciliations with outstanding items
- **Fixed asset schedules** — additions, disposals, depreciation, rollforward
- **Intercompany matrices** — confirmations
- **Sample selections** — ability to extract random samples by date / amount / account for testing
- **Audit trail extracts** — for testing of changes, approvals, etc.

## Data protection / privacy

- **Wyoming data breach law** (Wyoming Data Privacy Act if applicable) — notification obligations
- **PII handling** — vendor SSNs (for 1099s), employee data: encrypted at rest, access-logged
- **Document encryption** — at rest and in transit (table stakes)

## Record retention

Per Phase 0 decision:

| Category | Retention |
|---|---|
| Tax supporting records | 7 years |
| Fixed asset records | Life of asset + 7 years |
| Corporate governance | Permanent |
| Payroll records | 7 years |
| Contracts | Life of contract + 7 years |
| Bank statements | 7 years |
| Reconciliations | 7 years |

## Backup and disaster recovery

Per Phase 0:
- 2x daily backups
- GFS retention (7 daily, 4 weekly, 12 monthly, indefinite yearly)
- Cold restore acceptable for v1
- Quarterly restore tests
- Yearly archive escrow at secondary provider

## Cyber / information security

- MFA required for all users
- SSO via Google OAuth (v1), WorkOS later
- Encryption at rest and in transit
- Access reviews quarterly minimum
- Incident response plan (document in `docs/runbooks/`)
- Vendor due diligence on cloud providers

## Updates to this document

When a standard changes:
1. Note change here with date and source.
2. Open ticket for code changes needed.
3. Update `docs/accounting-rules.md` if business rules change.
4. Add test proving compliance.
