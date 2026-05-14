import type { NextConfig } from "next";

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
