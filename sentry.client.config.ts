// Sentry browser-side init. Loaded by `@sentry/nextjs`'s instrumentation
// hook on the client. When `NEXT_PUBLIC_SENTRY_DSN` is unset the SDK
// initialises in a no-op state, so this is safe to ship without an account.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
