import type { NextConfig } from "next";

/**
 * EU data-residency migration (2026-05-14)
 *
 * Database was migrated from Neon US (iad1) to Neon EU (eu-central-1 /
 * Frankfurt) for GDPR compliance. All Postgres traffic now terminates in
 * the EEA. Vercel edge/serverless functions still run globally, but DB
 * connections route to Frankfurt. See docs/data-residency.md and
 * docs/eu-migration-steps.md for details and the cutover runbook.
 */

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
};

export default nextConfig;
