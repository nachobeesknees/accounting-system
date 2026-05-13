/**
 * Entity scope. Lets the user pick which entity's books they're looking at
 * (or "All entities" for the firm-level consolidated view). The choice
 * persists in a cookie so it survives navigation.
 *
 * Reads and writes both happen server-side. A server action on the topbar
 * picker writes the cookie; data-fetching helpers read it to decide whether
 * to filter accounts / journal entries / reports to a single entity_id.
 */

import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const COOKIE = "tw_entity_scope";

/**
 * Returns the firm-entity-id stored in the cookie, but only if it
 * resolves to an actual firm in the offices table. Stale or unknown
 * values (e.g. an old client-entity id) are treated as "all firms".
 */
export async function getEntityScope(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  if (!v || v === "all") return null;
  const db = getDb();
  const [row] = await db
    .select({ id: schema.offices.id })
    .from(schema.offices)
    .where(eq(schema.offices.id, v))
    .limit(1);
  if (!row) return null; // stale cookie — fall back to "all firms"
  return v;
}

export async function setEntityScope(entityId: string | null) {
  const jar = await cookies();
  if (entityId === null) {
    jar.set(COOKIE, "all", {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      httpOnly: false,
    });
  } else {
    jar.set(COOKIE, entityId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      httpOnly: false,
    });
  }
}
