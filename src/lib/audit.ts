/**
 * Immutable audit log writer. Writes one row to `audit_log` per call.
 * User identity is denormalised at write time so deleting / renaming a
 * user later doesn't rewrite history.
 *
 * Use `logAuditEvent(session, …)` when you already have a `SessionUser`.
 * Use `logAuditEventFromHeaders(…)` from login/logout flows where no
 * session exists yet — the caller fills in the email manually.
 *
 * Failures are swallowed and logged; auditing should never block the
 * user's actual operation.
 */

import "server-only";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SessionUser } from "./types";

function uid(): string {
  return `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function captureRequestContext(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    const userAgent = h.get("user-agent") ?? null;
    return { ipAddress, userAgent };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

export type AuditEventInput = {
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  changes?: unknown;
  metadata?: unknown;
};

export async function logAuditEvent(
  session: SessionUser | null,
  input: AuditEventInput,
): Promise<void> {
  try {
    const ctx = await captureRequestContext();
    const db = getDb();
    await db.insert(schema.auditLog).values({
      id: uid(),
      userId: session?.userId ?? null,
      userEmail: session?.email ?? null,
      userRole: session?.role ?? null,
      action: input.action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      resourceName: input.resourceName ?? null,
      changes: input.changes == null ? null : (input.changes as object),
      metadata: input.metadata == null ? null : (input.metadata as object),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  } catch (err) {
    console.error("[audit] write failed", err);
  }
}

/**
 * Login / logout flow — no session yet, so the caller supplies the
 * email directly. If the email matches a known user, we look up the
 * user id + role for the audit row (best-effort).
 */
export async function logAuditEventFromHeaders(
  input: AuditEventInput & { userEmail: string },
): Promise<void> {
  try {
    const db = getDb();
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(eq(schema.users.email, input.userEmail.toLowerCase()))
      .limit(1);
    const ctx = await captureRequestContext();
    await db.insert(schema.auditLog).values({
      id: uid(),
      userId: user?.id ?? null,
      userEmail: input.userEmail,
      userRole: user?.role ?? null,
      action: input.action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? user?.id ?? null,
      resourceName: input.resourceName ?? null,
      changes: input.changes == null ? null : (input.changes as object),
      metadata: input.metadata == null ? null : (input.metadata as object),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  } catch (err) {
    console.error("[audit] write failed", err);
  }
}
