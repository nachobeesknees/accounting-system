# Project conventions for Claude

## Post-deploy QC — required after every production deploy

After `vercel --prod` (or any git push that triggers a Vercel build), do a quick smoke test in Chrome before declaring the deploy done. Keep it light — do **not** run a full multi-agent test sweep. The goal is to catch obvious regressions in under a minute.

The test:

1. Navigate to https://accounting-system-sepia.vercel.app/login
2. Click one of the demo account buttons (typically "Demo Admin") and confirm you land on the dashboard with KPIs populated
3. Visit **5 random feature pages** out of the sidebar (e.g. Journal Entries detail, Trial Balance, Entities, Assets/AUA, Time Entries, Reconciliation, Bank Accounts, Fees, etc.). Screenshot each.
4. Confirm each page renders without errors and shows real data from Postgres

If any page fails, fix it before considering the deploy complete.

## Stack notes

- Next.js 15 App Router · Drizzle + postgres-js · Neon Postgres · Tailwind v4 · cookie-based HMAC sessions
- DB is `thistlewood-db` on Neon (Vercel marketplace integration, free tier, iad1 region)
- `DATABASE_URL` is provisioned across Production / Preview / Development envs (no `STORAGE_` prefix)
- All money values render as `USD 1,234.56` in JetBrains Mono with tabular nums; negatives in parens; design tokens in `globals.css`
- Demo accounts: every account uses password `demo123`
- After schema changes: `npm run db:push -- --force` then `npm run db:seed`

## Manufactured-session test cookie

For programmatic smoke tests, the SESSION_SECRET default in production is `thistlewood-dev-secret-do-not-use-in-prod`. The cookie format is `tw_session=<userId>.<HMAC-SHA256-base64url>`. Admin user id is `u-admin`.

```js
import { createHmac } from "node:crypto";
const SECRET = "thistlewood-dev-secret-do-not-use-in-prod";
const sig = createHmac("sha256", SECRET).update("u-admin").digest("base64url");
const cookie = `tw_session=u-admin.${sig}`;
```
