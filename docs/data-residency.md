# Data residency

**Status:** EU-resident as of 2026-05-14
**Database region:** Neon `eu-central-1` (Frankfurt, Germany)
**Cloud provider:** AWS `eu-central-1` (ISO 27001, SOC 2 Type II certified)

## Where customer data lives

| Layer            | Region                          | Notes                                                                 |
| ---------------- | ------------------------------- | --------------------------------------------------------------------- |
| Postgres (Neon)  | `eu-central-1` (Frankfurt)      | Primary store. All customer data, audit logs, attachments metadata.   |
| Vercel compute   | Global edge / serverless        | Stateless. DB calls egress to Frankfurt over TLS.                     |
| Vercel Blob      | `eu-central-1` (where pinned)   | File attachments. Configured for EU region.                           |
| Session cookies  | User's browser                  | HMAC-signed `tw_session` cookie. Contains user id only, no PII.       |

Customer-record data (clients, invoices, journal entries, attachments,
audit log, user profiles) is stored exclusively in Neon's
`eu-central-1` Postgres cluster. The data does **not** leave the EEA
during normal operation.

## GDPR basis for transfer

Personal data is **stored within the EEA**, so no cross-border transfer
under GDPR Chapter V is triggered for the database tier. Where Vercel
compute (which is globally distributed) temporarily processes personal
data in transit, it does so:

- under standard contractual clauses (SCCs) with Vercel as processor; and
- via Vercel's GDPR-compliant data processing addendum (DPA), which
  covers Article 28 (processor obligations) and Article 46 (transfer
  safeguards) where applicable.

The lawful basis combination relied on is therefore:

- **Article 6(1)(b) / 6(1)(f)** — performance of contract / legitimate
  interest for the ordinary processing of customer accounting data; and
- **Article 46** — appropriate safeguards (SCCs + processor DPAs) for
  any incidental transfer outside the EEA via edge compute.

## Operational guarantees

- Backups are taken by Neon and retained within `eu-central-1`.
- Read replicas, if added, are pinned to EU regions only.
- All staff access to the database is via Neon's EU console / pooler
  endpoints — there is no admin path that egresses the data to a US
  region.
- The application sends an `X-Data-Region: eu-central-1` response
  header on every authenticated route, so an auditor can confirm
  routing from a browser network tab without reading our infra config.

## When this changes

If we add a US region (e.g., for a US-based subsidiary), this document
must be updated to describe the routing split and the legal basis for
any data flows between regions. Until then, **all production database
traffic is EU-only**.

## Related

- Cutover runbook: [eu-migration-steps.md](./eu-migration-steps.md)
- Middleware header source: [src/middleware.ts](../src/middleware.ts)
