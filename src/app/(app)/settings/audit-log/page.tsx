import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { getDistinctAuditActions, listAuditLog } from "@/lib/audit";
import { listUsers } from "@/lib/user-mutations";

type Params = {
  startDate?: string;
  endDate?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  expand?: string;
};

function formatTs(iso: string): string {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d
    .toISOString()
    .slice(11, 19)}Z`;
}

function buildQs(p: Params, override: Partial<Params>): string {
  const merged: Params = { ...p, ...override };
  const sp = new URLSearchParams();
  if (merged.startDate) sp.set("startDate", merged.startDate);
  if (merged.endDate) sp.set("endDate", merged.endDate);
  if (merged.userId) sp.set("userId", merged.userId);
  if (merged.action) sp.set("action", merged.action);
  if (merged.resourceType) sp.set("resourceType", merged.resourceType);
  if (merged.expand) sp.set("expand", merged.expand);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!hasPermission(me, "audit.view")) {
    return (
      <>
        <PageHeader title="Audit log" />
        <div className="px-6 py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
          You don&rsquo;t have permission to view the audit log.
        </div>
      </>
    );
  }

  const params = await searchParams;
  const filter = {
    startDate: params.startDate || null,
    endDate: params.endDate || null,
    userId: params.userId || null,
    action: params.action || null,
    resourceType: params.resourceType || null,
    limit: 1000,
  };
  const [rows, users, actions] = await Promise.all([
    listAuditLog(filter),
    listUsers(),
    getDistinctAuditActions(),
  ]);

  const expanded = new Set((params.expand ?? "").split(",").filter(Boolean));

  const resourceTypes = Array.from(
    new Set(
      rows
        .map((r) => r.resourceType)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    ),
  ).sort();

  const exportQs = new URLSearchParams();
  if (filter.startDate) exportQs.set("startDate", filter.startDate);
  if (filter.endDate) exportQs.set("endDate", filter.endDate);
  if (filter.userId) exportQs.set("userId", filter.userId);
  if (filter.action) exportQs.set("action", filter.action);
  if (filter.resourceType) exportQs.set("resourceType", filter.resourceType);

  return (
    <>
      <PageHeader
        title="Audit log"
        meta={`${rows.length} events${rows.length === 1000 ? " (capped)" : ""}`}
        actions={
          hasPermission(me, "audit.export") ? (
            <a
              href={`/api/audit-log/csv?${exportQs.toString()}`}
              style={{
                fontSize: 12.5,
                padding: "6px 12px",
                background: "var(--paper)",
                border: "1px solid var(--line-2)",
                borderRadius: 5,
                color: "var(--ink-2)",
                textDecoration: "none",
              }}
            >
              Export CSV
            </a>
          ) : null
        }
      />

      <div className="px-6 py-3.5 flex flex-col gap-3.5">
        <Card title="Filters">
          <form
            method="get"
            className="p-3.5 grid"
            style={{
              gridTemplateColumns: "repeat(5, minmax(0, 1fr)) auto",
              gap: 10,
              alignItems: "end",
            }}
          >
            <label className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                From
              </span>
              <input
                type="date"
                name="startDate"
                defaultValue={params.startDate ?? ""}
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                To
              </span>
              <input
                type="date"
                name="endDate"
                defaultValue={params.endDate ?? ""}
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                User
              </span>
              <select
                name="userId"
                defaultValue={params.userId ?? ""}
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              >
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Action
              </span>
              <select
                name="action"
                defaultValue={params.action ?? ""}
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              >
                <option value="">All actions</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Resource
              </span>
              <select
                name="resourceType"
                defaultValue={params.resourceType ?? ""}
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              >
                <option value="">All resources</option>
                {resourceTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="submit"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  border: "1px solid var(--accent)",
                  borderRadius: 5,
                  padding: "7px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  height: 32,
                }}
              >
                Apply
              </button>
              <a
                href="/settings/audit-log"
                style={{
                  padding: "7px 12px",
                  fontSize: 13,
                  color: "var(--ink-2)",
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  textDecoration: "none",
                  height: 32,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Reset
              </a>
            </div>
          </form>
        </Card>

        <Card title="Events">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Timestamp</TH>
                <TH>User</TH>
                <TH>Action</TH>
                <TH>Resource</TH>
                <TH>IP</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 && (
                <TR hover={false}>
                  <TD>
                    <span style={{ color: "var(--ink-4)" }}>No events match.</span>
                  </TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                </TR>
              )}
              {rows.map((r) => {
                const isExpanded = expanded.has(r.id);
                const nextExpand = isExpanded
                  ? Array.from(expanded).filter((x) => x !== r.id).join(",")
                  : Array.from(new Set([...expanded, r.id])).join(",");
                return [
                  <TR key={r.id}>
                    <TD mono>{formatTs(r.timestamp)}</TD>
                    <TD>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span>{r.userEmail ?? "—"}</span>
                        {r.userRole && (
                          <span
                            style={{
                              fontSize: 10.5,
                              color: "var(--ink-4)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {r.userRole}
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD mono>{r.action}</TD>
                    <TD>
                      {r.resourceType ? (
                        <span>
                          {r.resourceType}
                          {r.resourceName && (
                            <span style={{ color: "var(--ink-4)" }}>
                              {" "}
                              · {r.resourceName}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>—</span>
                      )}
                    </TD>
                    <TD mono>{r.ipAddress ?? ""}</TD>
                    <TD>
                      <a
                        href={`/settings/audit-log${buildQs(params, { expand: nextExpand })}#row-${r.id}`}
                        id={`row-${r.id}`}
                        style={{
                          fontSize: 11.5,
                          color: "var(--ink-2)",
                          textDecoration: "underline",
                        }}
                      >
                        {isExpanded ? "Hide" : "Details"}
                      </a>
                    </TD>
                  </TR>,
                  isExpanded ? (
                    <TR key={`${r.id}-detail`} hover={false}>
                      <TD style={{ background: "var(--rail)" }} colSpan={6}>
                        <div
                          style={{
                            padding: "8px 4px",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11.5,
                            whiteSpace: "pre-wrap",
                            color: "var(--ink-2)",
                          }}
                        >
                          {r.changes != null && (
                            <div>
                              <strong>Changes:</strong>{"\n"}
                              {JSON.stringify(r.changes, null, 2)}
                            </div>
                          )}
                          {r.metadata != null && (
                            <div style={{ marginTop: 8 }}>
                              <strong>Metadata:</strong>{"\n"}
                              {JSON.stringify(r.metadata, null, 2)}
                            </div>
                          )}
                          {r.userAgent && (
                            <div style={{ marginTop: 8 }}>
                              <strong>User-agent:</strong> {r.userAgent}
                            </div>
                          )}
                          {r.resourceId && (
                            <div style={{ marginTop: 8 }}>
                              <strong>Resource id:</strong> {r.resourceId}
                            </div>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ) : null,
                ];
              })}
            </TBody>
          </Table>
        </Card>

        <div
          className="text-[11.5px]"
          style={{ color: "var(--ink-4)", textAlign: "center" }}
        >
          Audit log is immutable — entries cannot be edited or deleted from the UI.
        </div>
      </div>
    </>
  );
}
