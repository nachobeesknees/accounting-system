import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * EU data-residency migration (2026-05-14)
 *
 * Database was migrated from Neon US (iad1) to Neon EU (eu-central-1 /
 * Frankfurt) for GDPR compliance. All Postgres traffic now terminates in
 * the EEA. Vercel edge/serverless functions still run globally, but DB
 * connections route to Frankfurt. See docs/data-residency.md and
 * docs/eu-migration-steps.md for details and the cutover runbook.
 */

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "font-src 'self'; " +
      "connect-src 'self' *.neon.tech wss://*.neon.tech; " +
      "frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Keep DB drivers external so their CJS modules aren't mangled by
  // webpack — Neon's serverless driver and the `ws` polyfill it uses
  // need real Node `net` access at runtime.
  serverExternalPackages: ["@neondatabase/serverless", "ws", "postgres"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

// Wrap with Sentry. With `NEXT_PUBLIC_SENTRY_DSN` unset the SDK is a
// no-op; we still get the wrapper so the day a DSN lands in env nothing
// else has to change. `silent: true` keeps the build log clean.
export default withSentryConfig(nextConfig, {
  silent: true,
  // We don't have a Sentry account wired up yet — disabling source-map
  // upload keeps the build offline-friendly.
  sourcemaps: { disable: true },
});
