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

export function register() {
  // No-op for now; placeholder for future telemetry.
}

export async function onRequestError(
  error: { digest?: string } & Error,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  // eslint-disable-next-line no-console
  console.error(
    `[onRequestError] ${request.method} ${request.path} (${context.routerKind} ${context.routeType}) digest=${error.digest ?? "?"}`,
    "\n",
    error.stack ?? error.message,
  );
}
