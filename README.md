# Wyzird — ERP Accounting

A double-entry accounting demo for a small professional services firm.

**Stack:** Next.js 15 (App Router, server components, server actions) · Drizzle ORM · Neon Postgres · Tailwind CSS v4 · Auth.js credentials sessions · Vercel.

The app requires a Postgres database. Neon is recommended for hosted deployments.

## Local development

```bash
npm install
npm run dev
```

Set `DATABASE_URL` and `AUTH_SECRET` in `.env.local`, run the database setup below, then open <http://localhost:3000>. Click any demo account on the sign-in page.

## Database

Provision a Neon Postgres instance, set `DATABASE_URL` in `.env.local`, then:

```bash
npm run db:push        # apply schema
npm run db:seed        # seed demo data
```

## Deployment (Vercel)

Push to the connected GitHub repo. Vercel auto-detects Next.js. Add the following env vars in the project settings:

| Key | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string |
| `AUTH_SECRET` | yes | 32+ random bytes for Auth.js JWT cookies |
| `CRON_SECRET` | yes | Bearer token required by `/api/cron/recurring-invoices` in production |
| `BLOB_READ_WRITE_TOKEN` | if using attachments | Vercel Blob token for private attachment storage |
| `ANTHROPIC_API_KEY` | if using OCR | Claude OCR extraction |
| `NEXT_PUBLIC_SENTRY_DSN` | no | Client/server error reporting |
