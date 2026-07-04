import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { CloseTabs } from "./CloseTabs";
import { getSessionUser } from "@/lib/session";
import {
  ensureAccountingPeriods,
  getAccountingPeriods,
} from "@/lib/periods";
import {
  getPeriodCloseTasksForPeriods,
  type PeriodCloseTaskRow,
} from "@/lib/data";
import { ensurePeriodCloseTasks } from "@/lib/mutations";
import { hasPermission } from "@/lib/permissions";

import { setCloseTaskAction } from "./actions";

export const dynamic = "force-dynamic";

function progress(tasks: PeriodCloseTaskRow[]): { done: number; total: number } {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done" || t.status === "na").length;
  return { done, total };
}

function taskPill(status: PeriodCloseTaskRow["status"]) {
  switch (status) {
    case "done":
      return <Pill variant="active">Done</Pill>;
    case "na":
      return <Pill variant="neutral">N/A</Pill>;
    default:
      return <Pill variant="pending">Open</Pill>;
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; period?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const errorMsg = params.error ?? null;
  const canTask = hasPermission(user, "close.task");

  await ensureAccountingPeriods(new Date().getUTCFullYear());
  const allPeriods = await getAccountingPeriods();

  // Show a bounded, recent-first window (current year ± neighbouring months).
  const today = new Date().toISOString().slice(0, 10);
  const periods = allPeriods
    .filter((p) => p.status !== "locked" || p.endDate >= `${new Date().getUTCFullYear() - 1}-01-01`)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 18);

  // Seed the standard checklist for every displayed non-locked period.
  for (const p of periods) {
    if (p.status !== "locked") await ensurePeriodCloseTasks(p.id);
  }
  const tasksByPeriod = await getPeriodCloseTasksForPeriods(periods.map((p) => p.id));

  // Which period's detail is expanded (defaults to the current period).
  const currentPeriod = periods.find(
    (p) => today >= p.startDate && today <= p.endDate,
  );
  const openPeriodId = params.period ?? currentPeriod?.id ?? periods[0]?.id ?? "";

  return (
    <>
      <PageHeader title="Month-End Close" meta={`${periods.length} periods`} />
      <CloseTabs active="checklist" />

      <div className="px-6 py-3.5 flex flex-col gap-3.5">
        {errorMsg && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {errorMsg}
          </div>
        )}

        <Card title="Close checklist">
          <div
            className="px-3 py-2 text-[12px]"
            style={{ color: "var(--ink-3)", borderBottom: "1px solid var(--line)" }}
          >
            Every task must be Done or N/A before a period can be closed on
            the{" "}
            <a href="/settings/periods" style={{ color: "var(--ink-2)" }}>
              Accounting Periods
            </a>{" "}
            page. Toggle each task below.
          </div>
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Period</TH>
                <TH>Status</TH>
                <TH num>Progress</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {periods.map((p) => {
                const tasks = tasksByPeriod.get(p.id) ?? [];
                const { done, total } = progress(tasks);
                const pct = total === 0 ? 0 : Math.round((done / total) * 100);
                const isCurrent = today >= p.startDate && today <= p.endDate;
                const expanded = p.id === openPeriodId;
                return (
                  <TR key={p.id}>
                    <TD>
                      <a
                        href={`/close?period=${p.id}`}
                        style={{ color: expanded ? "var(--ink)" : "var(--ink-2)" }}
                      >
                        {p.name}
                      </a>
                      {isCurrent && (
                        <span
                          className="ml-2 text-[10.5px] uppercase"
                          style={{ color: "var(--ink-4)", letterSpacing: "0.04em" }}
                        >
                          (current)
                        </span>
                      )}
                    </TD>
                    <TD>
                      <Pill
                        variant={
                          p.status === "open"
                            ? "active"
                            : p.status === "closed"
                              ? "pending"
                              : "review"
                        }
                      >
                        {p.status[0].toUpperCase() + p.status.slice(1)}
                      </Pill>
                    </TD>
                    <TD num>
                      <span
                        style={{
                          color: pct === 100 ? "var(--p-active-fg)" : "var(--ink-2)",
                        }}
                      >
                        {done}/{total} ({pct}%)
                      </span>
                    </TD>
                    <TD>
                      <a
                        href={`/close?period=${p.id}`}
                        className="text-[12px]"
                        style={{ color: "var(--ink-3)" }}
                      >
                        {expanded ? "Viewing" : "Open"}
                      </a>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>

        {openPeriodId &&
          (() => {
            const p = periods.find((x) => x.id === openPeriodId);
            if (!p) return null;
            const tasks = tasksByPeriod.get(p.id) ?? [];
            return (
              <Card title={`Checklist — ${p.name}`}>
                <Table>
                  <THead>
                    <TR hover={false}>
                      <TH>Task</TH>
                      <TH>Status</TH>
                      <TH>Completed</TH>
                      <TH>Set</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {tasks.length === 0 && (
                      <TR>
                        <TD colSpan={4} style={{ color: "var(--ink-3)" }}>
                          No checklist tasks (locked period).
                        </TD>
                      </TR>
                    )}
                    {tasks.map((t) => (
                      <TR key={t.id}>
                        <TD>{t.label}</TD>
                        <TD>{taskPill(t.status)}</TD>
                        <TD style={{ color: "var(--ink-3)" }}>
                          {t.completedAt
                            ? new Date(t.completedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "UTC",
                              })
                            : "—"}
                        </TD>
                        <TD>
                          {canTask ? (
                            <div className="flex gap-1.5">
                              {(["done", "na", "open"] as const).map((s) => (
                                <form key={s} action={setCloseTaskAction}>
                                  <input type="hidden" name="taskId" value={t.id} />
                                  <input type="hidden" name="status" value={s} />
                                  <Button
                                    variant={t.status === s ? "primary" : "secondary"}
                                    type="submit"
                                  >
                                    {s === "na" ? "N/A" : s[0].toUpperCase() + s.slice(1)}
                                  </Button>
                                </form>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: "var(--ink-4)" }}>—</span>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            );
          })()}
      </div>
    </>
  );
}
