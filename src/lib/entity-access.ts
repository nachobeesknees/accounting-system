/**
 * Per-user entity scoping. A row in user_entity_access means "this user
 * can see entity X" (optionally at read_only level). No rows for a user
 * means UNRESTRICTED — they see everything. That's the admin default.
 *
 * super_admin and isSuperuser users always bypass the filter, even if
 * they happen to have rows. The intent of the table is to *restrict*
 * lesser roles, not to gate admins.
 *
 * Helpers return null to mean "no restriction" and string[] to mean
 * "restrict to this set". Callers must handle null explicitly — an
 * empty array means "no access to anything" (which is unusual but
 * valid).
 */

import "server-only";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hasPermission } from "./permissions";
import type { SessionUser } from "./types";

/**
 * Returns the set of entity ids the user is restricted to, or `null`
 * for "unrestricted". super_admin / isSuperuser always returns null.
 */
export async function getAllowedEntityIds(
  user: SessionUser | null | undefined,
): Promise<Set<string> | null> {
  if (!user) return new Set();
  if (user.isSuperuser || user.role === "super_admin" || user.role === "admin") {
    return null;
  }
  const db = getDb();
  const rows = await db
    .select({ entityId: schema.userEntityAccess.entityId })
    .from(schema.userEntityAccess)
    .where(eq(schema.userEntityAccess.userId, user.userId));
  if (rows.length === 0) return null; // unrestricted (admin default)
  return new Set(rows.map((r) => r.entityId));
}

/**
 * Returns the set of client (customer) ids the user is restricted to,
 * or null for unrestricted. Same semantics as `getAllowedEntityIds`.
 */
export async function getAllowedClientIds(
  user: SessionUser | null | undefined,
): Promise<Set<string> | null> {
  if (!user) return new Set();
  if (user.isSuperuser || user.role === "super_admin" || user.role === "admin") {
    return null;
  }
  const db = getDb();
  const rows = await db
    .select({ customerId: schema.userClientAccess.customerId })
    .from(schema.userClientAccess)
    .where(eq(schema.userClientAccess.userId, user.userId));
  if (rows.length === 0) return null;
  return new Set(rows.map((r) => r.customerId));
}

/** Convenience: does the user have ACTION-level access to this entity? */
export function isEntityAllowed(
  allowed: Set<string> | null,
  entityId: string | null | undefined,
): boolean {
  if (allowed === null) return true; // unrestricted
  if (!entityId) return true; // firm-level rows are visible to anyone scoped
  return allowed.has(entityId);
}

/**
 * In-place filter for any { entityId? } shape. Drops items whose
 * entityId is set and not in the allowed set.
 */
export function filterByEntityAccess<T extends { entityId?: string | null }>(
  items: T[],
  allowed: Set<string> | null,
): T[] {
  if (allowed === null) return items;
  return items.filter((i) => isEntityAllowed(allowed, i.entityId ?? null));
}

/**
 * "Can this user write to this entity at all?" — returns false when the
 * user has the entity in their access list at read_only, true otherwise.
 * Useful for hiding edit/delete buttons on /entities/[id] pages.
 */
export async function getEntityWriteAccess(
  user: SessionUser | null | undefined,
  entityId: string,
): Promise<boolean> {
  if (!user) return false;
  if (user.isSuperuser || user.role === "super_admin" || user.role === "admin") {
    return hasPermission(user, "settings.write");
  }
  const db = getDb();
  const [row] = await db
    .select({ accessLevel: schema.userEntityAccess.accessLevel })
    .from(schema.userEntityAccess)
    .where(eq(schema.userEntityAccess.userId, user.userId))
    .limit(1);
  // No rows at all → unrestricted (matches getAllowedEntityIds).
  if (!row) return hasPermission(user, "settings.write");
  return row.accessLevel === "full" && hasPermission(user, "settings.write");
}
