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
import { and, desc, eq, gte, lte } from "drizzle-orm";
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
// ---------- Read side ----------

export type AuditLogRow = {
  id: string;
  timestamp: string;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  resourceName: string | null;
  changes: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
};

export type AuditLogFilter = {
  startDate?: string | null;
  endDate?: string | null;
  userId?: string | null;
  action?: string | null;
  resourceType?: string | null;
  limit?: number;
};

function mapAuditRow(r: typeof schema.auditLog.$inferSelect): AuditLogRow {
  return {
    id: r.id,
    timestamp: r.timestamp.toISOString(),
    userId: r.userId,
    userEmail: r.userEmail,
    userRole: r.userRole,
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    resourceName: r.resourceName,
    changes: r.changes,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    metadata: r.metadata,
  };
}

export async function listAuditLog(
  filter: AuditLogFilter = {},
): Promise<AuditLogRow[]> {
  const db = getDb();
  const conds = [] as ReturnType<typeof eq>[];
  if (filter.startDate) {
    conds.push(gte(schema.auditLog.timestamp, new Date(filter.startDate)));
  }
  if (filter.endDate) {
    // Push end to end-of-day so YYYY-MM-DD inputs are inclusive.
    const end = new Date(filter.endDate);
    end.setUTCHours(23, 59, 59, 999);
    conds.push(lte(schema.auditLog.timestamp, end));
  }
  if (filter.userId) conds.push(eq(schema.auditLog.userId, filter.userId));
  if (filter.action) conds.push(eq(schema.auditLog.action, filter.action));
  if (filter.resourceType) {
    conds.push(eq(schema.auditLog.resourceType, filter.resourceType));
  }
  let q = db.select().from(schema.auditLog).$dynamic();
  if (conds.length > 0) q = q.where(and(...conds));
  const rows = await q
    .orderBy(desc(schema.auditLog.timestamp))
    .limit(filter.limit ?? 500);
  return rows.map(mapAuditRow);
}

export async function getDistinctAuditActions(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ action: schema.auditLog.action })
    .from(schema.auditLog);
  const seen = new Set<string>();
  for (const r of rows) seen.add(r.action);
  return Array.from(seen).sort();
}

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
