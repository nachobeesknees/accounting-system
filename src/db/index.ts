/**
 * Database client. Optional — falls back to undefined when DATABASE_URL is
 * not set, so the in-memory store path keeps working in the demo.
 *
 * When DATABASE_URL is configured (Neon recommended on Vercel), call
 * `getDb()` to obtain a typed Drizzle client.
 */

import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

let cached: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (cached) return cached;
  const sql = neon(url);
  cached = drizzle(sql, { schema });
  return cached;
}

export { schema };
