import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getSessionUser } from "@/lib/session";
import {
  getAccounts,
  getAmortizationEntries,
  getAmortizationScheduleById,
  getJournalEntryById,
} from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";

import { generateEntriesAction } from "../actions";

export const dynamic = "force-dynamic";

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px]" style={{ color: "var(--ink-4)" }}>
        {k}
      </span>
      <span
        className="text-[13px]"
        style={{
          color: "var(--ink)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
      >
        {v}
      </span>
    </div>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const errorMsg = sp.error ?? null;
  const canWrite = hasPermission(user, "settings.write");

  const sched = await getAmortizationScheduleById(id);
  if (!sched) notFound();

  const [entries, accounts] = await Promise.all([
    getAmortizationEntries(id),
    getAccounts("all"),
  ]);
  // Journal-entry detail route is keyed by entry number, not id.
  const jeEntries = await Promise.all(
    entries.map((e) =>
      e.journalEntryId ? getJournalEntryById(e.journalEntryId) : Promise.resolve(undefined),
    ),
  );
  const entryNumberByJeId = new Map<string, string>();
  for (const je of jeEntries) if (je) entryNumberByJeId.set(je.id, je.entryNumber);
  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const src = acctById.get(sched.sourceAccountId);
  const tgt = acctById.get(sched.targetAccountId);

  const fmt = (n: number) =>
    formatMoney(n, "USD", { paren: true, hideCurrency: true });

  const generatedTotal = entries.reduce((s, e) => s + e.amount, 0);
  const remaining = sched.totalCost - sched.residualValue - generatedTotal;
  const perMonth =
    Math.round(((sched.totalCost - sched.residualValue) / sched.months) * 100) /
    100;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={sched.name}
        meta={sched.kind === "prepaid" ? "Prepaid amortization" : "Fixed-asset depreciation"}
        actions={
          <Link href="/schedules" className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            ← All schedules
          </Link>
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

        <Card title="Details">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-3 py-3">
            <KV k="Source" v={`${src?.code ?? "?"} — ${src?.name ?? ""}`} />
            <KV k="Target" v={`${tgt?.code ?? "?"} — ${tgt?.name ?? ""}`} />
            <KV k="Total cost" v={fmt(sched.totalCost)} mono />
            <KV k="Residual" v={fmt(sched.residualValue)} mono />
            <KV k="Per month" v={fmt(perMonth)} mono />
            <KV k="Months" v={String(sched.months)} mono />
            <KV k="Start date" v={sched.startDate} mono />
            <KV k="Generated through" v={sched.generatedThrough ?? "—"} mono />
            <KV k="Generated to date" v={fmt(generatedTotal)} mono />
            <KV k="Remaining" v={fmt(remaining)} mono />
          </div>
          {canWrite && sched.isActive && (
            <form
              action={generateEntriesAction}
              className="flex flex-wrap items-end gap-3 px-3 py-3"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <input type="hidden" name="scheduleId" value={sched.id} />
              <label className="flex flex-col gap-1">
                <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                  Generate through
                </span>
                <input
                  type="date"
                  name="throughDate"
                  defaultValue={today}
                  className="px-2.5 py-1.5 text-[13px] rounded-md outline-none"
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--line-2)",
                    color: "var(--ink)",
                  }}
                />
              </label>
              <Button variant="primary" type="submit">
                Generate due entries
              </Button>
              <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
                Posts one monthly JE per open period, never double-booking a month.
              </span>
            </form>
          )}
        </Card>

        <Card title={`Generated entries (${entries.length}/${sched.months})`}>
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Period</TH>
                <TH num>Amount</TH>
                <TH>Journal entry</TH>
              </TR>
            </THead>
            <TBody>
              {entries.length === 0 && (
                <TR>
                  <TD colSpan={3} style={{ color: "var(--ink-3)" }}>
                    No entries generated yet.
                  </TD>
                </TR>
              )}
              {entries.map((e) => (
                <TR key={e.id}>
                  <TD>{e.periodDate}</TD>
                  <TD num>{fmt(e.amount)}</TD>
                  <TD>
                    {e.journalEntryId && entryNumberByJeId.get(e.journalEntryId) ? (
                      <Link
                        href={`/journal/${entryNumberByJeId.get(e.journalEntryId)}`}
                        className="text-[12px]"
                        style={{ color: "var(--ink-2)" }}
                      >
                        {entryNumberByJeId.get(e.journalEntryId)}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--ink-4)" }}>—</span>
                    )}
                  </TD>
                </TR>
              ))}
              {entries.length > 0 && (
                <TR total hover={false}>
                  <TD style={{ fontWeight: 600, color: "var(--ink)" }}>Total</TD>
                  <TD num>{fmt(generatedTotal)}</TD>
                  <TD>
                    {generatedTotal >= sched.totalCost - sched.residualValue - 0.005 ? (
                      <Pill variant="active">Fully amortized</Pill>
                    ) : (
                      <Pill variant="pending">In progress</Pill>
                    )}
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
