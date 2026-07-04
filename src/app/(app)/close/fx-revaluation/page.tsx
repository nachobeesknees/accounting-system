import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { CloseTabs } from "../CloseTabs";
import { getSessionUser } from "@/lib/session";
import { previewFxRevaluation } from "@/lib/mutations";
import { getFxRevaluations, getFirmEntities } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";

import { bookFxRevaluationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; scope?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const errorMsg = params.error ?? null;
  const canRevalue = hasPermission(user, "fx.revalue");

  const today = new Date().toISOString().slice(0, 10);
  const revalDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
    ? params.date
    : today;
  const scope = params.scope ?? "all";

  const [preview, history, offices] = await Promise.all([
    previewFxRevaluation(
      revalDate,
      scope === "all" ? "all" : scope === "firm" ? null : scope,
    ),
    getFxRevaluations(),
    getFirmEntities(),
  ]);
  const officeName = new Map(offices.map((o) => [o.id, o.name]));

  const fmt = (n: number) =>
    formatMoney(n, "USD", { paren: true, hideCurrency: true });

  return (
    <>
      <PageHeader title="Period-End FX Revaluation" meta={`As of ${revalDate}`} />
      <CloseTabs active="fx-revaluation" />

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

        <Card title="Revaluation date">
          <form method="GET" className="flex flex-wrap items-end gap-3 px-3 py-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                Period-end date
              </span>
              <input
                type="date"
                name="date"
                defaultValue={revalDate}
                className="px-2.5 py-1.5 text-[13px] rounded-md outline-none"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  color: "var(--ink)",
                }}
              />
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
                <option value="all">All (incl. firm-level AP)</option>
                <option value="firm">Firm-level only</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} (AR only)
                  </option>
                ))}
              </select>
            </label>
            <Button variant="secondary" type="submit">
              Preview
            </Button>
          </form>
          <div
            className="px-3 py-2 text-[12px]"
            style={{ color: "var(--ink-3)", borderTop: "1px solid var(--line)" }}
          >
            Reprices open foreign-currency AR (invoices) and AP (bills) at the
            period-end rate. Booking posts one JE dated {revalDate} debiting or
            crediting the AR/AP control accounts against an FX gain/loss
            account, auto-reversed on day&nbsp;1 of the next month.
          </div>
        </Card>

        <Card
          title={`Unrealized gain/loss — base ${preview.baseCode}`}
          actions={
            <Pill variant={preview.totalNetGainLoss >= 0 ? "active" : "review"}>
              Net {preview.totalNetGainLoss >= 0 ? "gain" : "loss"}{" "}
              {fmt(preview.totalNetGainLoss)}
            </Pill>
          }
        >
          {preview.missingRates.length > 0 && (
            <div
              className="px-3 py-2 text-[12px]"
              style={{ color: "var(--p-review-fg)", borderBottom: "1px solid var(--line)" }}
            >
              No period-end rate on/before {revalDate} for:{" "}
              {preview.missingRates.join(", ")}. Those currencies are excluded
              — add a rate on the Currencies / FX page.
            </div>
          )}
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Currency</TH>
                <TH num>Period-end rate</TH>
                <TH num>AR (native)</TH>
                <TH num>AR Δ ({preview.baseCode})</TH>
                <TH num>AP (native)</TH>
                <TH num>AP Δ ({preview.baseCode})</TH>
                <TH num>Net gain/(loss)</TH>
              </TR>
            </THead>
            <TBody>
              {preview.details.length === 0 && (
                <TR>
                  <TD colSpan={7} style={{ color: "var(--ink-3)" }}>
                    No open foreign-currency AR/AP balances for this scope.
                  </TD>
                </TR>
              )}
              {preview.details.map((d) => (
                <TR key={d.currencyCode}>
                  <TD mono>{d.currencyCode}</TD>
                  <TD num>{d.periodEndRate}</TD>
                  <TD num>{fmt(d.arNative)}</TD>
                  <TD num neg={d.arDelta < 0}>{fmt(d.arDelta)}</TD>
                  <TD num>{fmt(d.apNative)}</TD>
                  <TD num neg={d.apDelta < 0}>{fmt(d.apDelta)}</TD>
                  <TD num neg={d.netGainLoss < 0}>{fmt(d.netGainLoss)}</TD>
                </TR>
              ))}
              {preview.details.length > 0 && (
                <TR total hover={false}>
                  <TD colSpan={3} style={{ fontWeight: 600, color: "var(--ink)" }}>
                    Total
                  </TD>
                  <TD num neg={preview.totalArDelta < 0}>{fmt(preview.totalArDelta)}</TD>
                  <TD></TD>
                  <TD num neg={preview.totalApDelta < 0}>{fmt(preview.totalApDelta)}</TD>
                  <TD num neg={preview.totalNetGainLoss < 0}>
                    {fmt(preview.totalNetGainLoss)}
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
          {canRevalue && preview.details.length > 0 && (
            <form
              action={bookFxRevaluationAction}
              className="px-3 py-3 flex items-center gap-2"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <input type="hidden" name="revaluationDate" value={revalDate} />
              <input type="hidden" name="scope" value={scope} />
              <Button variant="primary" type="submit">
                Book revaluation
              </Button>
              <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                Posts + auto-reverses next period.
              </span>
            </form>
          )}
        </Card>

        <Card title="Revaluation history">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Date</TH>
                <TH>Scope</TH>
                <TH>Entry</TH>
                <TH>Reversal</TH>
                <TH num>Net gain/(loss)</TH>
              </TR>
            </THead>
            <TBody>
              {history.length === 0 && (
                <TR>
                  <TD colSpan={5} style={{ color: "var(--ink-3)" }}>
                    No revaluation runs yet.
                  </TD>
                </TR>
              )}
              {history.map((h) => {
                const details = (h.details ?? {}) as {
                  totalNetGainLoss?: number;
                };
                const scopeLabel = h.firmEntityId
                  ? officeName.get(h.firmEntityId) ?? h.firmEntityId
                  : "Firm-level / all";
                return (
                  <TR key={h.id}>
                    <TD>{h.revaluationDate}</TD>
                    <TD>{scopeLabel}</TD>
                    <TD mono>{h.journalEntryId ?? "—"}</TD>
                    <TD mono>{h.reversalEntryId ?? "—"}</TD>
                    <TD num neg={(details.totalNetGainLoss ?? 0) < 0}>
                      {fmt(details.totalNetGainLoss ?? 0)}
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
