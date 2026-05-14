/**
 * Database client (Drizzle).
 *
 * Reads DATABASE_URL from the environment. Picks driver by URL:
 *   - `*.neon.tech` / `pooler.…` → `drizzle-orm/neon-serverless` over a
 *     WebSocket. Tolerant of Neon's PgBouncer dropping idle connections —
 *     the WS reconnects on the next query, and the driver supports real
 *     transactions (which `mutations.ts` depends on).
 *   - anything else (local Postgres in dev) → `drizzle-orm/postgres-js`.
 *
 * The previous postgres-js setup against Neon's pooled endpoint caused
 * intermittent "Connection closed" 500s on Vercel because the cached pool
 * outlived the server-side socket timeouts; the Neon driver handles that
 * for us.
 */

import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import postgres from "postgres";
import * as schema from "./schema";

// In Node.js the Neon serverless driver needs an explicit WebSocket impl.
// In edge / browser it picks one up automatically.
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

type PgDb = PostgresJsDatabase<typeof schema>;
type NeonDb = NeonDatabase<typeof schema>;
type Db = PgDb | NeonDb;

declare global {
  // eslint-disable-next-line no-var
  var __thistlewood_pg:
    | {
        client: ReturnType<typeof postgres> | Pool;
        db: Db;
        kind: "pg" | "neon";
      }
    | undefined;
}

function isNeonUrl(url: string): boolean {
  return /neon\.(tech|build)|neondb\.net/.test(url);
}

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and configure it.",
    );
  }
  if (globalThis.__thistlewood_pg) return globalThis.__thistlewood_pg.db;
  if (isNeonUrl(url)) {
    const pool = new Pool({ connectionString: url });
    const db = drizzleNeon(pool, { schema });
    globalThis.__thistlewood_pg = { client: pool, db, kind: "neon" };
    return db;
  }
  // Local Postgres path.
  const client = postgres(url, { max: 5, prepare: false });
  const db = drizzlePg(client, { schema });
  globalThis.__thistlewood_pg = { client, db, kind: "pg" };
  return db;
}

export { schema };
