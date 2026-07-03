# Project conventions for Claude

## Post-deploy QC — required after every production deploy

After `vercel --prod` (or any git push that triggers a Vercel build), do a quick smoke test in Chrome before declaring the deploy done. Keep it light — do **not** run a full multi-agent test sweep. The goal is to catch obvious regressions in under a minute.

The test:

1. Navigate to https://wyzird.com/login
2. Sign in with a configured test/admin account and confirm you land on the dashboard with KPIs populated
3. Visit **5 random feature pages** out of the sidebar (e.g. Journal Entries detail, Trial Balance, Entities, Assets/AUA, Time Entries, Reconciliation, Bank Accounts, Fees, etc.). Screenshot each.
4. Confirm each page renders without errors and shows real data from Postgres

If any page fails, fix it before considering the deploy complete.

## Stack notes

- Next.js 15 App Router · Drizzle + postgres-js · Neon Postgres · Tailwind v4 · Auth.js JWT sessions
- DB is `thistlewood-db` on Neon (Vercel marketplace integration, free tier, iad1 region)
- `DATABASE_URL` is provisioned across Production / Preview / Development envs (no `STORAGE_` prefix)
- All money values render as `USD 1,234.56` in JetBrains Mono with tabular nums; negatives in parens; design tokens in `globals.css`
- Demo login: `ENABLE_DEMO_LOGIN=true` shows the one-click passwordless picker (admin / accountant / viewer) and lets those three accounts in without a password check. The production demo runs with it ON (owner's call, 2026-07-03). Email+password stays available for everyone else.
- After schema changes: `npm run db:push -- --force` then `npm run db:seed`
