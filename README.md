# Thistlewood & Associates — Accounting

A double-entry accounting demo for a small professional services firm.

**Stack:** Next.js 15 (App Router, server components, server actions) · Drizzle ORM · Neon Postgres (optional) · Tailwind CSS v4 · cookie-based sessions · Vercel.

The app ships with seed data so it works end-to-end without a database. When `DATABASE_URL` is set (Neon recommended), the same code paths swap over to real persistence.

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Click any demo account on the sign-in page (`demo123` is the password for all of them).

## Database (optional)

Provision a Neon Postgres instance, set `DATABASE_URL` in `.env.local`, then:

```bash
npm run db:push        # apply schema
npm run db:seed        # seed Thistlewood demo data
```

## Deployment (Vercel)

Push to the connected GitHub repo. Vercel auto-detects Next.js. Add the following env vars in the project settings:

| Key | Required | Notes |
|---|---|---|
| `DATABASE_URL` | optional | Neon connection string for real persistence |
| `SESSION_SECRET` | recommended | 32+ random bytes for HMAC-signing the session cookie |
