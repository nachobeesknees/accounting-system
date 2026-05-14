# EU migration cutover — manual steps

This runbook walks through migrating the Thistlewood ERP database from
Neon US (`iad1`) to Neon EU (`eu-central-1` / Frankfurt) for GDPR
compliance. The repo changes (scripts, middleware header, docs) are
already merged; this document is the **operator runbook** for the
one-time cutover.

Plan for **~30–60 minutes** of focused time plus a 7-day verification
window before deleting the old US project.

## Prerequisites

- `pg_dump` and `psql` installed locally (PostgreSQL client tools,
  v15+). On macOS: `brew install postgresql@16`.
- Access to https://console.neon.tech with the same account that owns
  the current `thistlewood-db` project.
- Access to the Vercel project's Environment Variables page.
- A scheduled maintenance window — the app should be considered
  read-only during the dump/restore.

## Step-by-step

### 1. Create the new EU project in Neon

1. Go to https://console.neon.tech.
2. Click **New Project**.
3. **Region:** `eu-central-1` (Frankfurt).
4. **Name:** `thistlewood-erp-eu`.
5. Postgres version: match the current US project (16+).
6. Create the project, then copy the **pooled connection string** from
   the Dashboard. This will be your `DATABASE_URL_EU`.

### 2. Put the app into a read-only window (optional but recommended)

Either pause the Vercel deployment or post a maintenance banner. If
the team is small and traffic is low, you can skip this and accept the
tiny risk of a few writes happening between dump and cutover.

### 3. Export the current US database

From the repo root:

```bash
DATABASE_URL="<current-US-connection-string>" bash scripts/export-db.sh
```

This writes `db-export.sql` to the current directory. Expect a few
seconds to a minute depending on data size. Confirm the file is
non-trivially sized (`ls -lh db-export.sql`).

### 4. Import into the EU database

```bash
DATABASE_URL_EU="<new-EU-connection-string>" bash scripts/import-db.sh
```

`psql` will stream the schema + data into the new EU project. Watch
for any errors — `--clean --if-exists` in the dump means re-runnable,
but unexpected errors should be investigated, not ignored.

### 5. Verify row counts

```bash
DATABASE_URL_EU="<new-EU-connection-string>" npx tsx scripts/verify-migration.ts
```

Compare each row count to the US counterpart. A quick way to get the
US counts for comparison:

```bash
DATABASE_URL="<US-connection-string>" npx tsx scripts/verify-migration.ts
```

(swap the env var — the script reads `DATABASE_URL_EU`, so set it to
whichever side you want to inspect.)

All counts should match exactly. If any differ, **stop** and
investigate before flipping production.

### 6. Update Vercel environment variables

1. Vercel dashboard → the ERP project → **Settings** → **Environment
   Variables**.
2. Update `DATABASE_URL` to the EU pooled connection string. Apply to
   Production, Preview, and Development.
3. If a `DIRECT_URL` variable exists (used by Drizzle for migrations),
   update that to the EU **direct** (non-pooled) connection string.
4. Save.

### 7. Trigger a redeploy

Push an empty commit, or click **Redeploy** in the Vercel dashboard
on the latest production deployment. The new build will pick up the
EU connection string.

### 8. End-to-end smoke test

Follow the QC checklist in [CLAUDE.md](../CLAUDE.md):

1. https://accounting-system-sepia.vercel.app/login
2. Log in as Demo Admin, confirm dashboard renders.
3. Visit five random feature pages (Journal Entries, Trial Balance,
   Entities, Reconciliation, Bank Accounts, etc.) and confirm they
   render with real data.
4. Open DevTools → Network → click any authenticated page → confirm
   the response has `X-Data-Region: eu-central-1`.
5. Tail the Vercel function logs for ~5 minutes and watch for DB
   errors.

### 9. Hold for 7 days, then delete the US project

Keep the old US Neon project around as a hot fallback for **7 days**.
If nothing has regressed in that window:

1. Take a final `pg_dump` of the US project and archive it
   off-platform (e.g., to encrypted Vercel Blob in EU, or a local
   encrypted volume).
2. In the Neon console, delete the old US project.
3. Update [docs/data-residency.md](./data-residency.md) if anything
   about the operational guarantees has changed during cutover.

## Rollback

If the EU project misbehaves within the 7-day window:

1. Revert `DATABASE_URL` (and `DIRECT_URL`) in Vercel back to the US
   strings.
2. Redeploy.
3. Investigate the EU project offline before re-attempting cutover.

Because the US project is left intact for 7 days, rollback is a
single env-var change away.

## Notes

- `db-export.sql` may contain sensitive customer data. Do **not**
  commit it. It's covered by the existing `.gitignore` patterns for
  `*.sql` if you have one; double-check before committing anything in
  the repo root after running the export.
- The verification script uses Neon's HTTP driver, which is sufficient
  for `COUNT(*)` queries. For deeper schema comparisons, `pg_dump
  --schema-only` against both projects + `diff` is the gold standard.
