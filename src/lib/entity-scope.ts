/**
 * Entity scope. Lets the user pick which entity's books they're looking at
 * (or "All entities" for the firm-level consolidated view). The choice
 * persists in a cookie so it survives navigation.
 *
 * Reads and writes both happen server-side. A server action on the topbar
 * picker writes the cookie; data-fetching helpers read it to decide whether
 * to filter accounts / journal entries / reports to a single entity_id, or
 * — when a region is picked — to the set of offices in that region.
 *
 * Cookie format:
 *
 *   ""               → all entities (no filter)
 *   "of-teton"       → single office (back-compat shape)
 *   "region:rgn-us"  → all offices in region rgn-us
 */

import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const COOKIE = "tw_entity_scope";
const REGION_PREFIX = "region:";

/** Resolved entity scope used by filter helpers. */
export type EntityScope =
  | { kind: "all" }
  | { kind: "office"; officeId: string }
  | { kind: "region"; regionId: string; officeIds: string[] };

/**
 * @deprecated Use `resolveEntityScope()` instead. Kept for back-compat with
 * legacy single-id callers — returns the office id when the cookie holds a
 * single office, and `null` for "all" OR for region scope (so older code
 * that doesn't know about regions safely falls back to the "all" branch).
 *
 * Returns the firm-entity-id stored in the cookie, but only if it
 * resolves to an actual firm in the offices table. Stale or unknown
 * values (e.g. an old client-entity id) are treated as "all firms".
 */
export async function getEntityScope(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  if (!v || v === "all") return null;
  // Region scope is not representable as a single id — fall back to "all"
  // for legacy callers. New callers should use resolveEntityScope().
  if (v.startsWith(REGION_PREFIX)) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: schema.offices.id })
    .from(schema.offices)
    .where(eq(schema.offices.id, v))
    .limit(1);
  if (!row) return null; // stale cookie — fall back to "all firms"
  return v;
}

/**
 * Resolves the entity-scope cookie into a tagged-union value, validating any
 * referenced ids against the DB and dropping stale cookie values. For region
 * scope, also expands the region into the office-id list every filter
 * consumes.
 *
 * Callers that need to scope DB queries should prefer this over the
 * back-compat `getEntityScope()`.
 */
export async function resolveEntityScope(): Promise<EntityScope> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  if (!v || v === "all") return { kind: "all" };

  const db = getDb();

  if (v.startsWith(REGION_PREFIX)) {
    const regionId = v.slice(REGION_PREFIX.length);
    if (!regionId) return { kind: "all" };
    const [region] = await db
      .select({ id: schema.regions.id })
      .from(schema.regions)
      .where(eq(schema.regions.id, regionId))
      .limit(1);
    if (!region) return { kind: "all" }; // stale region id
    const offices = await db
      .select({ id: schema.offices.id })
      .from(schema.offices)
      .where(eq(schema.offices.regionId, regionId));
    return {
      kind: "region",
      regionId,
      officeIds: offices.map((o) => o.id),
    };
  }

  const [row] = await db
    .select({ id: schema.offices.id })
    .from(schema.offices)
    .where(eq(schema.offices.id, v))
    .limit(1);
  if (!row) return { kind: "all" }; // stale cookie
  return { kind: "office", officeId: v };
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
    // Stores the value verbatim — "of-teton" or "region:rgn-us".
    jar.set(COOKIE, entityId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      httpOnly: false,
    });
  }
}
