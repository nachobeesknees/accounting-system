import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAccounts,
  getBaseCurrency,
  getInvoiceById,
  getRevenueSchedules,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import { recognizeRevenueAction } from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ recognized?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const canRun = hasPermission(user, "close.task");

  const [schedules, accounts, base] = await Promise.all([
    getRevenueSchedules(),
    getAccounts(),
    getBaseCurrency(),
  ]);
  const baseCode = base?.code ?? "USD";
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  // Resolve invoice numbers for display.
  const invoiceIds = Array.from(new Set(schedules.map((s) => s.invoiceId)));
  const invEntries = await Promise.all(
    invoiceIds.map(async (id) => [id, await getInvoiceById(id)] as const),
  );
  const invById = new Map(invEntries);

  const active = schedules.filter((s) => s.status === "active");
  const totalDeferred = active.reduce(
    (s, r) => s + (parseAmount(r.total) - parseAmount(r.recognizedAmount)),
    0,
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Revenue recognition"
        meta={`${active.length} active schedule${active.length === 1 ? "" : "s"} · ${formatMoney(totalDeferred, baseCode, { compact: true })} unrecognized`}
      />

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {sp.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {sp.error}
          </div>
        )}
        {sp.recognized != null && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Recognized {sp.recognized} month-slice
            {sp.recognized === "1" ? "" : "s"}.
          </div>
        )}

        {canRun && (
          <Card title="Run recognition">
            <form action={recognizeRevenueAction}>
              <div className="p-3.5 flex items-end gap-3 flex-wrap">
                <Field
                  label="Recognize through"
                  name="throughDate"
                  type="date"
                  required
                  defaultValue={today}
                  help="Posts straight-line monthly slices up to this date that fall in an open period."
                />
                <Button variant="primary" type="submit">
                  Recognize through date
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card title="Schedules">
          {schedules.length === 0 ? (
            <Empty
              title="No deferred-revenue schedules"
              body="Schedules are created when an invoice with a deferred line is posted."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Invoice</TH>
                  <TH>Deferral acct</TH>
                  <TH>Revenue acct</TH>
                  <TH>Window</TH>
                  <TH num>Total</TH>
                  <TH num>Recognized</TH>
                  <TH num>Remaining</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {schedules.map((s) => {
                  const inv = invById.get(s.invoiceId);
                  const remaining =
                    parseAmount(s.total) - parseAmount(s.recognizedAmount);
                  return (
                    <TR key={s.id} hover={false}>
                      <TD mono>
                        <Link
                          href={`/invoices/${s.invoiceId}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {inv?.invoiceNumber ?? s.invoiceId}
                        </Link>
                      </TD>
                      <TD style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {accountById.get(s.deferralAccountId)?.code ?? "—"}
                      </TD>
                      <TD style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {accountById.get(s.revenueAccountId)?.code ?? "—"}
                      </TD>
                      <TD style={{ fontSize: 11.5 }}>
                        {formatDate(s.startDate)} → {formatDate(s.endDate)}
                      </TD>
                      <TD num>{formatMoney(s.total, baseCode, { compact: true })}</TD>
                      <TD num>
                        {formatMoney(s.recognizedAmount, baseCode, { compact: true })}
                      </TD>
                      <TD num>{formatMoney(remaining, baseCode, { compact: true })}</TD>
                      <TD>
                        <Pill
                          variant={
                            s.status === "complete"
                              ? "active"
                              : s.status === "cancelled"
                                ? "neutral"
                                : "pending"
                          }
                        >
                          {s.status}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
