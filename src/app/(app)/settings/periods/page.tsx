import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill, type PillVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  ensureAccountingPeriods,
  getAccountingPeriods,
  getDraftCountsByPeriod,
} from "@/lib/periods";
import type { AccountingPeriodStatus } from "@/lib/types";
import { getSessionUser } from "@/lib/session";

import {
  closePeriodAction,
  lockPeriodAction,
  reopenPeriodAction,
  seedPeriodsAction,
} from "./actions";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusPill(status: AccountingPeriodStatus): {
  variant: PillVariant;
  label: string;
} {
  switch (status) {
    case "open":
      return { variant: "active", label: "Open" };
    case "closed":
      return { variant: "pending", label: "Closed" };
    case "locked":
      return { variant: "review", label: "Locked" };
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Auto-seed on first load — covers the current year + the next year so a
  // brand-new install has the full grid populated.
  await ensureAccountingPeriods(new Date().getUTCFullYear());

  const periods = await getAccountingPeriods();
  const draftCounts = await getDraftCountsByPeriod(periods.map((p) => p.id));
  const params = await searchParams;
  const errorMsg = params?.error ?? null;

  // Today drives the "current period" highlight.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Accounting Periods"
        meta={`${periods.length} configured`}
        actions={
          <form action={seedPeriodsAction}>
            <Button variant="secondary" type="submit">
              Generate next year
            </Button>
          </form>
        }
      />

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

        <Card title="Monthly close">
          <div
            className="px-3 py-2 text-[12px]"
            style={{ color: "var(--ink-3)", borderBottom: "1px solid var(--line)" }}
          >
            Close a period to soft-warn users when they post into it (override
            with a reason). Lock a closed period to hard-block any new entries.
            Locked periods can only be reopened by a superadmin.
          </div>
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Period</TH>
                <TH>Date range</TH>
                <TH>Status</TH>
                <TH num>Drafts</TH>
                <TH>Closed</TH>
                <TH>Locked</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {periods.map((p) => {
                const pill = statusPill(p.status);
                const drafts = draftCounts.get(p.id) ?? 0;
                const isCurrent = today >= p.startDate && today <= p.endDate;
                return (
                  <TR key={p.id}>
                    <TD>
                      <span style={{ color: isCurrent ? "var(--ink)" : undefined }}>
                        {p.name}
                      </span>
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
                      {formatDate(p.startDate)} – {formatDate(p.endDate)}
                    </TD>
                    <TD>
                      <Pill variant={pill.variant}>{pill.label}</Pill>
                    </TD>
                    <TD num>
                      {drafts > 0 ? (
                        <span style={{ color: "var(--p-pending-fg)" }}>{drafts}</span>
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>—</span>
                      )}
                    </TD>
                    <TD>{formatTimestamp(p.closedAt)}</TD>
                    <TD>{formatTimestamp(p.lockedAt)}</TD>
                    <TD>
                      {p.status === "open" && (
                        <details>
                          <summary
                            className="cursor-pointer text-[12.5px]"
                            style={{ color: "var(--ink-2)" }}
                          >
                            Close period
                          </summary>
                          <form
                            action={closePeriodAction}
                            className="mt-2 flex flex-col gap-2"
                            style={{ maxWidth: 320 }}
                          >
                            <input type="hidden" name="periodId" value={p.id} />
                            {drafts > 0 && (
                              <div
                                className="text-[11.5px]"
                                style={{ color: "var(--p-pending-fg)" }}
                              >
                                Warning — {drafts} draft entr
                                {drafts === 1 ? "y is" : "ies are"} still in
                                this period. Closing will require them to use
                                an override reason on post.
                              </div>
                            )}
                            <textarea
                              name="notes"
                              placeholder="Optional notes (audit trail)"
                              rows={2}
                              style={{
                                background: "var(--paper)",
                                border: "1px solid var(--line-2)",
                                borderRadius: 6,
                                padding: "5px 8px",
                                fontSize: 12.5,
                                color: "var(--ink)",
                              }}
                            />
                            <div className="flex gap-2">
                              <Button variant="primary" type="submit">
                                Confirm close
                              </Button>
                            </div>
                          </form>
                        </details>
                      )}
                      {p.status === "closed" && (
                        <div className="flex flex-col gap-2">
                          <form action={lockPeriodAction}>
                            <input type="hidden" name="periodId" value={p.id} />
                            <Button variant="secondary" type="submit">
                              Lock period
                            </Button>
                          </form>
                          <details>
                            <summary
                              className="cursor-pointer text-[12.5px]"
                              style={{ color: "var(--ink-3)" }}
                            >
                              Reopen
                            </summary>
                            <form
                              action={reopenPeriodAction}
                              className="mt-2 flex flex-col gap-2"
                              style={{ maxWidth: 320 }}
                            >
                              <input type="hidden" name="periodId" value={p.id} />
                              <textarea
                                name="reason"
                                placeholder="Reason for reopening (required)"
                                rows={2}
                                required
                                style={{
                                  background: "var(--paper)",
                                  border: "1px solid var(--line-2)",
                                  borderRadius: 6,
                                  padding: "5px 8px",
                                  fontSize: 12.5,
                                  color: "var(--ink)",
                                }}
                              />
                              <Button variant="secondary" type="submit">
                                Reopen period
                              </Button>
                            </form>
                          </details>
                        </div>
                      )}
                      {p.status === "locked" && (
                        <details>
                          <summary
                            className="cursor-pointer text-[12.5px]"
                            style={{
                              color: user.isSuperuser ? "var(--ink-2)" : "var(--ink-4)",
                            }}
                          >
                            {user.isSuperuser
                              ? "Reopen (superadmin)"
                              : "Locked — superadmin only"}
                          </summary>
                          {user.isSuperuser && (
                            <form
                              action={reopenPeriodAction}
                              className="mt-2 flex flex-col gap-2"
                              style={{ maxWidth: 320 }}
                            >
                              <input type="hidden" name="periodId" value={p.id} />
                              <textarea
                                name="reason"
                                placeholder="Reason for reopening (required)"
                                rows={2}
                                required
                                style={{
                                  background: "var(--paper)",
                                  border: "1px solid var(--line-2)",
                                  borderRadius: 6,
                                  padding: "5px 8px",
                                  fontSize: 12.5,
                                  color: "var(--ink)",
                                }}
                              />
                              <Button variant="danger" type="submit">
                                Force reopen
                              </Button>
                            </form>
                          )}
                        </details>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
