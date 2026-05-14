/**
 * User-management mutations. All gated by `user.create` / `user.update` /
 * `user.reset_password` / `user.deactivate` / `user.assign_access` via
 * `requirePermission`. Each mutation writes an audit_log row so user
 * changes are traceable.
 *
 * Password hashing is bcrypt cost 10 — same as the seed-security-users
 * script so an "invited" user can log in with the temp password until
 * they reset it.
 */

import "server-only";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SessionUser } from "./types";
import { requirePermission, type Role } from "./permissions";
import { logAuditEvent } from "./audit";

const TEMP_PASSWORD = "ChangeMe123!";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export type AppUserRow = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isSuperuser: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  entityAccessCount: number;
};

export async function listUsers(): Promise<AppUserRow[]> {
  const db = getDb();
  const users = await db
    .select()
    .from(schema.users)
    .orderBy(schema.users.fullName);
  const access = await db
    .select({
      userId: schema.userEntityAccess.userId,
      entityId: schema.userEntityAccess.entityId,
    })
    .from(schema.userEntityAccess);
  const accessCounts = new Map<string, number>();
  for (const r of access) {
    accessCounts.set(r.userId, (accessCounts.get(r.userId) ?? 0) + 1);
  }
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    isSuperuser: u.isSuperuser,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    entityAccessCount: accessCounts.get(u.id) ?? 0,
  }));
}

export async function getUserById(id: string): Promise<AppUserRow | null> {
  const all = await listUsers();
  return all.find((u) => u.id === id) ?? null;
}

export type CreateUserInput = {
  email: string;
  fullName: string;
  role: Role;
  /** Optional — defaults to TEMP_PASSWORD when omitted (invite flow). */
  password?: string;
};

export async function createUser(
  actor: SessionUser,
  input: CreateUserInput,
): Promise<AppUserRow> {
  requirePermission(actor, "user.create");
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required.");
  if (!input.fullName.trim()) throw new Error("Full name is required.");
  const password = input.password?.trim() ? input.password : TEMP_PASSWORD;
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing) throw new Error("A user with that email already exists.");

  const id = uid("u");
  const hash = await bcrypt.hash(password, 10);
  await db.insert(schema.users).values({
    id,
    email,
    fullName: input.fullName.trim(),
    passwordHash: hash,
    role: input.role,
    isSuperuser: input.role === "super_admin",
    isActive: true,
  });
  await logAuditEvent(actor, {
    action: "user.create",
    resourceType: "user",
    resourceId: id,
    resourceName: email,
    changes: { after: { email, fullName: input.fullName, role: input.role } },
  });
  const row = await getUserById(id);
  if (!row) throw new Error("Created user vanished after insert.");
  return row;
}

export async function updateUserRole(
  actor: SessionUser,
  userId: string,
  role: Role,
): Promise<void> {
  requirePermission(actor, "user.update");
  const db = getDb();
  const [before] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!before) throw new Error("User not found.");
  if (before.role === role) return;
  await db
    .update(schema.users)
    .set({ role, isSuperuser: role === "super_admin" })
    .where(eq(schema.users.id, userId));
  await logAuditEvent(actor, {
    action: "user.update",
    resourceType: "user",
    resourceId: userId,
    resourceName: before.email,
    changes: { before: { role: before.role }, after: { role } },
  });
}

export async function setUserActive(
  actor: SessionUser,
  userId: string,
  isActive: boolean,
): Promise<void> {
  requirePermission(actor, "user.deactivate");
  if (actor.userId === userId && !isActive) {
    throw new Error("You can't deactivate your own account.");
  }
  const db = getDb();
  const [before] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!before) throw new Error("User not found.");
  if (before.isActive === isActive) return;
  await db
    .update(schema.users)
    .set({ isActive })
    .where(eq(schema.users.id, userId));
  await logAuditEvent(actor, {
    action: "user.deactivate",
    resourceType: "user",
    resourceId: userId,
    resourceName: before.email,
    changes: {
      before: { isActive: before.isActive },
      after: { isActive },
    },
  });
}

function generateTempPassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 14; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function resetUserPassword(
  actor: SessionUser,
  userId: string,
): Promise<{ tempPassword: string }> {
  requirePermission(actor, "user.reset_password");
  const db = getDb();
  const [before] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!before) throw new Error("User not found.");
  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, 10);
  await db
    .update(schema.users)
    .set({ passwordHash: hash })
    .where(eq(schema.users.id, userId));
  await logAuditEvent(actor, {
    action: "user.reset_password",
    resourceType: "user",
    resourceId: userId,
    resourceName: before.email,
  });
  return { tempPassword };
}

/**
 * Replace the user's entity access list. Pass [] to clear (sees-all default).
 */
export async function setUserEntityAccess(
  actor: SessionUser,
  userId: string,
  entries: Array<{ entityId: string; accessLevel: "full" | "read_only" }>,
): Promise<void> {
  requirePermission(actor, "user.assign_access");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.userEntityAccess)
      .where(eq(schema.userEntityAccess.userId, userId));
    if (entries.length === 0) return;
    await tx.insert(schema.userEntityAccess).values(
      entries.map((e, i) => ({
        id: `uea-${userId}-${i}-${Date.now().toString(36)}`,
        userId,
        entityId: e.entityId,
        accessLevel: e.accessLevel,
      })),
    );
  });
  await logAuditEvent(actor, {
    action: "user.assign_access",
    resourceType: "user",
    resourceId: userId,
    metadata: { count: entries.length },
    changes: { after: entries },
  });
}

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
