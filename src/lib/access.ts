/**
 * Per-user entity / client access controls.
 *
 * `user_entity_access` rows narrow what entities a user can see. The
 * convention is **opt-in restriction**: if a user has *no* rows, they
 * see everything (admin default). If they have at least one row, they
 * see only those entities. Same convention for `user_client_access`.
 *
 * Super-admins always bypass the filter — they see everything regardless
 * of rows. Use `getAccessibleEntityIds(user)` and
 * `getAccessibleCustomerIds(user)` from data-layer reads; both return
 * `null` to mean "no restriction" (so callers know to skip the WHERE
 * clause entirely) and an explicit (possibly empty) array otherwise.
 *
 * Server actions that mutate should call `assertEntityAccess(user, id)`
 * before they write — otherwise a user could spoof an entityId through
 * a form submission.
 */

import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SessionUser } from "./types";

/**
 * Returns the set of entity ids the user is allowed to see, or `null`
 * if they have unrestricted access (admin default).
 */
export async function getAccessibleEntityIds(
  user: SessionUser | null | undefined,
): Promise<string[] | null> {
  if (!user) return [];
  if (user.isSuperuser) return null;
  // Admin / manager / accountant / viewer all default to "unrestricted"
  // unless they have explicit rows. Employees are restricted by *client*,
  // which transitively narrows their entity view through entities.clientId.
  if (user.role === "employee") {
    const customerIds = await getAccessibleCustomerIds(user);
    if (customerIds == null) return null;
    if (customerIds.length === 0) return [];
    const db = getDb();
    const rows = await db
      .select({ id: schema.entities.id })
      .from(schema.entities);
    return rows
      .filter((r) => r.id)
      .map((r) => r.id)
      .filter((id) => id.length > 0);
  }
  const db = getDb();
  const rows = await db
    .select({ entityId: schema.userEntityAccess.entityId })
    .from(schema.userEntityAccess)
    .where(eq(schema.userEntityAccess.userId, user.userId));
  if (rows.length === 0) return null;
  return rows.map((r) => r.entityId);
}

/**
 * Returns the set of customer ids the user is allowed to see, or `null`
 * if unrestricted. Used by the employee role.
 */
export async function getAccessibleCustomerIds(
  user: SessionUser | null | undefined,
): Promise<string[] | null> {
  if (!user) return [];
  if (user.isSuperuser) return null;
  const db = getDb();
  const rows = await db
    .select({ customerId: schema.userClientAccess.customerId })
    .from(schema.userClientAccess)
    .where(eq(schema.userClientAccess.userId, user.userId));
  if (rows.length === 0 && user.role !== "employee") return null;
  return rows.map((r) => r.customerId);
}

/**
 * Throws if the user cannot access this entity. Use at the top of
 * mutations that act on a specific entity.
 */
export async function assertEntityAccess(
  user: SessionUser | null | undefined,
  entityId: string,
): Promise<void> {
  const allowed = await getAccessibleEntityIds(user);
  if (allowed == null) return; // unrestricted
  if (!allowed.includes(entityId)) {
    throw new Error("Not authorized: this entity is outside your access scope.");
  }
}

/**
 * Throws if the user cannot access this customer.
 */
export async function assertCustomerAccess(
  user: SessionUser | null | undefined,
  customerId: string,
): Promise<void> {
  const allowed = await getAccessibleCustomerIds(user);
  if (allowed == null) return;
  if (!allowed.includes(customerId)) {
    throw new Error("Not authorized: this client is outside your access scope.");
  }
}

/**
 * Set or replace the entity-access list for `targetUserId`. Pass an
 * empty array to clear all rows (i.e. restore the "sees all entities"
 * default).
 */
export async function setUserEntityAccess(
  targetUserId: string,
  entries: Array<{ entityId: string; accessLevel: "full" | "read_only" }>,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.userEntityAccess)
      .where(eq(schema.userEntityAccess.userId, targetUserId));
    if (entries.length === 0) return;
    await tx.insert(schema.userEntityAccess).values(
      entries.map((e, i) => ({
        id: `uea-${targetUserId}-${i}-${Date.now().toString(36)}`,
        userId: targetUserId,
        entityId: e.entityId,
        accessLevel: e.accessLevel,
      })),
    );
  });
}

/** Same shape as setUserEntityAccess but for client access. */
export async function setUserClientAccess(
  targetUserId: string,
  entries: Array<{ customerId: string; accessLevel: "full" | "read_only" }>,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.userClientAccess)
      .where(eq(schema.userClientAccess.userId, targetUserId));
    if (entries.length === 0) return;
    await tx.insert(schema.userClientAccess).values(
      entries.map((e, i) => ({
        id: `uca-${targetUserId}-${i}-${Date.now().toString(36)}`,
        userId: targetUserId,
        customerId: e.customerId,
        accessLevel: e.accessLevel,
      })),
    );
  });
}

/** Current entity-access rows for a user (for the settings UI). */
export async function listUserEntityAccess(
  userId: string,
): Promise<Array<{ entityId: string; accessLevel: "full" | "read_only" }>> {
  const db = getDb();
  const rows = await db
    .select({
      entityId: schema.userEntityAccess.entityId,
      accessLevel: schema.userEntityAccess.accessLevel,
    })
    .from(schema.userEntityAccess)
    .where(eq(schema.userEntityAccess.userId, userId));
  return rows.map((r) => ({
    entityId: r.entityId,
    accessLevel: (r.accessLevel as "full" | "read_only") ?? "full",
  }));
}

void and;
