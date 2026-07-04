import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { CloseTabs } from "../CloseTabs";
import { getSessionUser } from "@/lib/session";
import { getYearEndClosePreview } from "@/lib/mutations";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";

import { closeYearAction, reopenYearAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; scope?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const currentYear = new Date().getUTCFullYear();
  const fiscalYear = parseInt(params.year ?? String(currentYear), 10);
  const scope = params.scope ?? "all";
  const errorMsg = params.error ?? null;
  const canClose = hasPermission(user, "close.year_end");

  const rows = await getYearEndClosePreview(
    fiscalYear,
    scope === "all" ? "all" : scope === "firm" ? null : scope,
  );

  const fmt = (n: number) =>
    formatMoney(n, "USD", { paren: true, hideCurrency: true });

  const yearOptions: number[] = [];
  for (let y = currentYear + 1; y >= currentYear - 6; y--) yearOptions.push(y);

  return (
    <>
      <PageHeader
        title="Year-End Close"
        meta={`FY ${fiscalYear}`}
      />
      <CloseTabs active="year-end" />

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

        <Card title="Fiscal year">
          <form method="GET" className="flex flex-wrap items-end gap-3 px-3 py-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                Fiscal year
              </span>
              <select
                name="year"
                defaultValue={String(fiscalYear)}
                className="px-2.5 py-1.5 text-[13px] rounded-md outline-none"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  color: "var(--ink)",
                }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                Scope
              </span>
              <select
                name="scope"
                defaultValue={scope}
                className="px-2.5 py-1.5 text-[13px] rounded-md outline-none"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  color: "var(--ink)",
                }}
              >
                <option value="all">All firm entities</option>
                <option value="firm">Firm-level only</option>
              </select>
            </label>
            <Button variant="secondary" type="submit">
              Show
            </Button>
          </form>
          <div
            className="px-3 py-2 text-[12px]"
            style={{ color: "var(--ink-3)", borderTop: "1px solid var(--line)" }}
          >
            Closing a year posts ONE closing journal entry per firm entity,
            dated {fiscalYear}-12-31, that zeroes every revenue and expense
            account into Retained Earnings (3100). Closing entries are excluded
            from income-statement views but included on the balance sheet, so
            &ldquo;Current Year Earnings&rdquo; reflects the current fiscal year
            only.
          </div>
        </Card>

        <Card title={`Net income by firm entity — FY ${fiscalYear}`}>
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Firm entity</TH>
                <TH num>Revenue</TH>
                <TH num>Expenses</TH>
                <TH num>Net income</TH>
                <TH>Status</TH>
                <TH>Closing entry</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 && (
                <TR>
                  <TD colSpan={7} style={{ color: "var(--ink-3)" }}>
                    No firm entities in scope.
                  </TD>
                </TR>
              )}
              {rows.map((r) => (
                <TR key={r.officeId ?? "firm"}>
                  <TD>{r.label}</TD>
                  <TD num>{fmt(r.revenue)}</TD>
                  <TD num>{fmt(r.expenses)}</TD>
                  <TD num neg={r.netIncome < 0}>{fmt(r.netIncome)}</TD>
                  <TD>
                    {r.status === "closed" ? (
                      <Pill variant="active">Closed</Pill>
                    ) : r.status === "reopened" ? (
                      <Pill variant="review">Reopened</Pill>
                    ) : (
                      <Pill variant="pending">Open</Pill>
                    )}
                  </TD>
                  <TD mono>{r.entryNumber ?? "—"}</TD>
                  <TD>
                    {canClose && r.status === "closed" && r.closeId ? (
                      <form action={reopenYearAction}>
                        <input type="hidden" name="closeId" value={r.closeId} />
                        <input type="hidden" name="fiscalYear" value={fiscalYear} />
                        <input type="hidden" name="scope" value={scope} />
                        <Button variant="danger" type="submit">
                          Reopen
                        </Button>
                      </form>
                    ) : (
                      <span style={{ color: "var(--ink-4)" }}>—</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {canClose && rows.some((r) => r.status !== "closed") && (
            <form
              action={closeYearAction}
              className="px-3 py-3 flex items-center gap-2"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <input type="hidden" name="fiscalYear" value={fiscalYear} />
              <input type="hidden" name="scope" value={scope} />
              <Button variant="primary" type="submit">
                Close FY {fiscalYear} for all open entities in scope
              </Button>
              <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                Already-closed entities are skipped.
              </span>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
