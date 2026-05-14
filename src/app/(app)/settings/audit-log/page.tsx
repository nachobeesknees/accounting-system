import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { getSessionUser } from "@/lib/session";
import {
  getDistinctAuditActions,
  getDistinctAuditResourceTypes,
  listAuditLog,
} from "@/lib/audit";

type Params = {
  startDate?: string;
  endDate?: string;
  userEmail?: string;
  action?: string;
  resourceType?: string;
  page?: string;
  expand?: string;
};

const PAGE_SIZE = 50;

function fmtTs(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}Z`;
}

function buildQs(p: Params, overrides: Partial<Params>): string {
  const merged: Params = { ...p, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
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
  // Spec: only super_admin can access this page.
  if (me.role !== "super_admin" && !me.isSuperuser) {
    redirect("/settings");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const filter = {
    startDate: params.startDate || null,
    endDate: params.endDate || null,
    userEmail: params.userEmail || null,
    action: params.action || null,
    resourceType: params.resourceType || null,
    page,
    pageSize: PAGE_SIZE,
  };
  const [{ rows, total }, actions, resourceTypes] = await Promise.all([
    listAuditLog(filter),
    getDistinctAuditActions(),
    getDistinctAuditResourceTypes(),
  ]);

  const expanded = new Set((params.expand ?? "").split(",").filter(Boolean));
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportQs = buildQs(params, { page: undefined, expand: undefined });

  return (
    <>
      <PageHeader
        title="Audit log"
        meta={
          total === 0
            ? "0 events"
            : `${total} events · page ${page} of ${lastPage}`
        }
        actions={
          <a
            href={`/api/audit-log/csv${exportQs}`}
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
                User email
              </span>
              <input
                type="text"
                name="userEmail"
                defaultValue={params.userEmail ?? ""}
                placeholder="contains…"
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
                Resource type
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

        <Card title={`Events${total > 0 ? ` · ${total}` : ""}`}>
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
                    <span style={{ color: "var(--ink-4)" }}>
                      No events match the current filter.
                    </span>
                  </TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                </TR>
              )}
              {rows.flatMap((r) => {
                const isExpanded = expanded.has(r.id);
                const nextExpand = isExpanded
                  ? Array.from(expanded)
                      .filter((x) => x !== r.id)
                      .join(",")
                  : Array.from(new Set([...expanded, r.id])).join(",");
                const elems = [
                  <TR key={r.id}>
                    <TD mono>{fmtTs(r.timestamp)}</TD>
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
                        href={`/settings/audit-log${buildQs(params, {
                          expand: nextExpand,
                        })}#row-${r.id}`}
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
                ];
                if (isExpanded) {
                  elems.push(
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
                    </TR>,
                  );
                }
                return elems;
              })}
            </TBody>
          </Table>
        </Card>

        {lastPage > 1 && (
          <div
            className="flex items-center justify-between text-[12px]"
            style={{ color: "var(--ink-3)" }}
          >
            <div>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(total, page * PAGE_SIZE)} of {total}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {page > 1 && (
                <a
                  href={`/settings/audit-log${buildQs(params, {
                    page: String(page - 1),
                  })}`}
                  style={{
                    padding: "6px 10px",
                    background: "var(--paper)",
                    border: "1px solid var(--line-2)",
                    borderRadius: 4,
                    textDecoration: "none",
                    color: "var(--ink-2)",
                  }}
                >
                  ← Previous
                </a>
              )}
              {page < lastPage && (
                <a
                  href={`/settings/audit-log${buildQs(params, {
                    page: String(page + 1),
                  })}`}
                  style={{
                    padding: "6px 10px",
                    background: "var(--paper)",
                    border: "1px solid var(--line-2)",
                    borderRadius: 4,
                    textDecoration: "none",
                    color: "var(--ink-2)",
                  }}
                >
                  Next →
                </a>
              )}
            </div>
          </div>
        )}

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
