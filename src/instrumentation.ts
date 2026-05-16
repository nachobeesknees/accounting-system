/**
 * Next.js instrumentation hook. Captures uncaught errors from server
 * components and route handlers so they end up in Vercel function logs
 * with their stack trace, rather than just the opaque digest the
 * client sees.
 *
 * The default Next.js error.tsx hides server-side error messages in
 * production builds; `onRequestError` is the only Next-provided hook
 * that surfaces them server-side.
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
