/**
 * User-management mutations. All require the `user.manage` permission.
 *
 * Passwords are stored as bcrypt hashes (cost 10). The "reset password"
 * flow returns a one-time temporary password that's shown to the admin
 * once — we never store it in plaintext.
 *
 * Every mutation here logs an audit-log event so user changes are
 * traceable and immutable.
 */

import "server-only";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SessionUser } from "./types";
import { requirePermission, type Role } from "./permissions";
import { logAuditEvent } from "./audit";
import { setUserEntityAccess as _setUserEntityAccess } from "./access";

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
};

function mapUser(r: typeof schema.users.$inferSelect): AppUserRow {
  return {
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    role: r.role,
    isSuperuser: r.isSuperuser,
    isActive: r.isActive,
    lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listUsers(): Promise<AppUserRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.users)
    .orderBy(schema.users.fullName);
  return rows.map(mapUser);
}

export async function getUserById(id: string): Promise<AppUserRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  return row ? mapUser(row) : null;
}

export type CreateUserInput = {
  email: string;
  fullName: string;
  role: Role;
  password: string;
};

export async function createUser(
  actor: SessionUser,
  input: CreateUserInput,
): Promise<AppUserRow> {
  requirePermission(actor, "user.manage");
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required.");
  if (!input.fullName.trim()) throw new Error("Full name is required.");
  if (input.password.length < 8) {
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
  const hash = await bcrypt.hash(input.password, 10);
  const [row] = await db
    .insert(schema.users)
    .values({
      id,
      email,
      fullName: input.fullName.trim(),
      passwordHash: hash,
      role: input.role,
      isSuperuser: input.role === "super_admin",
      isActive: true,
    })
    .returning();
  await logAuditEvent(actor, {
    action: "user.create",
    resourceType: "user",
    resourceId: id,
    resourceName: email,
    changes: { after: { email, fullName: input.fullName, role: input.role } },
  });
  return mapUser(row);
}

export async function updateUserRole(
  actor: SessionUser,
  userId: string,
  role: Role,
): Promise<void> {
  requirePermission(actor, "user.manage");
  const db = getDb();
  const [before] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!before) throw new Error("User not found.");
  await db
    .update(schema.users)
    .set({
      role,
      isSuperuser: role === "super_admin",
    })
    .where(eq(schema.users.id, userId));
  await logAuditEvent(actor, {
    action: "user.role_change",
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
  requirePermission(actor, "user.manage");
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
  await db
    .update(schema.users)
    .set({ isActive })
    .where(eq(schema.users.id, userId));
  await logAuditEvent(actor, {
    action: isActive ? "user.activate" : "user.deactivate",
    resourceType: "user",
    resourceId: userId,
    resourceName: before.email,
    changes: {
      before: { isActive: before.isActive },
      after: { isActive },
    },
  });
}

/**
 * Generate a one-time temporary password, hash it into the user record,
 * and return the plaintext to the caller exactly once. Display rules
 * are the caller's responsibility — we never store the plaintext.
 */
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
  requirePermission(actor, "user.manage");
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
    action: "user.password_reset",
    resourceType: "user",
    resourceId: userId,
    resourceName: before.email,
  });
  return { tempPassword };
}

export async function setUserEntityAccess(
  actor: SessionUser,
  userId: string,
  entries: Array<{ entityId: string; accessLevel: "full" | "read_only" }>,
): Promise<void> {
  requirePermission(actor, "user.manage");
  await _setUserEntityAccess(userId, entries);
  await logAuditEvent(actor, {
    action: "user.entity_access_update",
    resourceType: "user",
    resourceId: userId,
    metadata: { count: entries.length },
    changes: { after: entries },
  });
}

void and;
