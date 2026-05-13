/**
 * Database client (Drizzle + postgres-js).
 *
 * Reads DATABASE_URL from the environment. The driver works against any
 * standard Postgres connection string — local Postgres in dev, Neon's
 * pooled endpoint in production. We use postgres-js (not the Neon HTTP
 * driver) so we get real transactions, which mutations.ts depends on
 * for atomic journal-entry inserts.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __thistlewood_pg: { client: ReturnType<typeof postgres>; db: Db } | undefined;
}

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and configure it.",
    );
  }
  if (globalThis.__thistlewood_pg) return globalThis.__thistlewood_pg.db;
  // postgres-js: keep the pool small — Next.js spins up one connection
  // per server-component render and Vercel functions are short-lived.
  const client = postgres(url, { max: 5, prepare: false });
  const db = drizzle(client, { schema });
  globalThis.__thistlewood_pg = { client, db };
  return db;
}

export { schema };
