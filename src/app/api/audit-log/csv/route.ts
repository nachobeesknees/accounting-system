import { NextResponse, type NextRequest } from "next/server";

import { serializeCsv } from "@/lib/csv";
import { getSessionUser } from "@/lib/session";
import { listAuditLog, logAuditEvent } from "@/lib/audit";

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  // Audit-log access is super_admin only (same gate as /settings/audit-log).
  if (user.role !== "super_admin" && !user.isSuperuser) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  // Pull everything that matches the filter — capped at 10k rows so a
  // single export can't run away.
  const { rows } = await listAuditLog({
    startDate: sp.get("startDate") || null,
    endDate: sp.get("endDate") || null,
    userEmail: sp.get("userEmail") || null,
    action: sp.get("action") || null,
    resourceType: sp.get("resourceType") || null,
    page: 1,
    pageSize: 10_000,
  });

  const headers = [
    "Timestamp",
    "User",
    "Role",
    "Action",
    "Resource type",
    "Resource id",
    "Resource name",
    "Changes",
    "Metadata",
    "IP",
    "User agent",
  ];
  const data = rows.map((r) => ({
    Timestamp: r.timestamp,
    User: r.userEmail ?? "",
    Role: r.userRole ?? "",
    Action: r.action,
    "Resource type": r.resourceType ?? "",
    "Resource id": r.resourceId ?? "",
    "Resource name": r.resourceName ?? "",
    Changes: r.changes != null ? JSON.stringify(r.changes) : "",
    Metadata: r.metadata != null ? JSON.stringify(r.metadata) : "",
    IP: r.ipAddress ?? "",
    "User agent": r.userAgent ?? "",
  }));
  const csv = serializeCsv(headers, data);

  await logAuditEvent(user, {
    action: "audit_log.export",
    resourceType: "audit_log",
    metadata: { rowCount: rows.length },
  });

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
