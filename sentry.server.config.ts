// Sentry server-side init (Node runtime). When `NEXT_PUBLIC_SENTRY_DSN`
// is unset the SDK initialises in a no-op state — safe to ship without
// a real DSN.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
