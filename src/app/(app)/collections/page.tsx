import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getBaseCurrency,
  getCollectionActivities,
  getCustomers,
  getInvoices,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";
import type { CollectionActivity } from "@/lib/types";

function daysBetween(from: string, to: Date): number {
  const d = new Date(`${from}T00:00:00Z`);
  return Math.floor((to.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ logged?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  const [invoices, customers, activities, base] = await Promise.all([
    getInvoices(),
    getCustomers(),
    getCollectionActivities(),
    getBaseCurrency(),
  ]);
  const baseCode = base?.code ?? "USD";
  const customerById = new Map(customers.map((c) => [c.id, c] as const));
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // Aggregate overdue AR per client.
  type Row = {
    customerId: string;
    customerName: string;
    totalOverdue: number;
    oldestAgeDays: number;
    lastActivity: CollectionActivity | null;
    nextPromise: CollectionActivity | null;
    brokenPromise: CollectionActivity | null;
  };
  const rowsByCustomer = new Map<string, Row>();

  for (const inv of invoices) {
    if (inv.isTemplate) continue;
    if (inv.status === "void" || inv.status === "paid") continue;
    if ((inv.kind ?? "invoice") === "credit_memo") continue;
    const balance = parseAmount(inv.balanceDue);
    if (balance <= 0) continue;
    const age = daysBetween(inv.dueDate, today);
    if (age <= 0) continue; // only overdue
    const row =
      rowsByCustomer.get(inv.customerId) ??
      ({
        customerId: inv.customerId,
        customerName: customerById.get(inv.customerId)?.name ?? "—",
        totalOverdue: 0,
        oldestAgeDays: 0,
        lastActivity: null,
        nextPromise: null,
        brokenPromise: null,
      } as Row);
    row.totalOverdue += balance;
    row.oldestAgeDays = Math.max(row.oldestAgeDays, age);
    rowsByCustomer.set(inv.customerId, row);
  }

  // Attach latest activity + next open promise + broken promise.
  const activitiesByCustomer = new Map<string, CollectionActivity[]>();
  for (const a of activities) {
    const arr = activitiesByCustomer.get(a.customerId) ?? [];
    arr.push(a);
    activitiesByCustomer.set(a.customerId, arr);
  }
  for (const row of rowsByCustomer.values()) {
    const acts = activitiesByCustomer.get(row.customerId) ?? [];
    row.lastActivity = acts[0] ?? null; // already newest-first
    const openPromises = acts.filter(
      (a) => a.kind === "promise" && a.status === "open" && a.promiseDate,
    );
    // Broken = promise date past + still open.
    row.brokenPromise =
      openPromises.find((a) => a.promiseDate! < todayIso) ?? null;
    // Next promise = earliest future promise date.
    row.nextPromise =
      openPromises
        .filter((a) => a.promiseDate! >= todayIso)
        .sort((a, b) => a.promiseDate!.localeCompare(b.promiseDate!))[0] ?? null;
  }

  const rows = Array.from(rowsByCustomer.values()).sort((a, b) => {
    // Broken promises first, then oldest age, then largest balance.
    if (!!a.brokenPromise !== !!b.brokenPromise) return a.brokenPromise ? -1 : 1;
    if (b.oldestAgeDays !== a.oldestAgeDays) return b.oldestAgeDays - a.oldestAgeDays;
    return b.totalOverdue - a.totalOverdue;
  });

  const brokenRows = rows.filter((r) => r.brokenPromise);

  return (
    <>
      <PageHeader
        title="Collections workbench"
        meta={`${rows.length} clients with overdue AR · ${brokenRows.length} broken promise${brokenRows.length === 1 ? "" : "s"}`}
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
        {sp.logged && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Collection activity logged.
          </div>
        )}

        {brokenRows.length > 0 && (
          <Card title="Broken promises to pay">
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Client</TH>
                  <TH>Promised</TH>
                  <TH num>Amount</TH>
                  <TH>Notes</TH>
                </TR>
              </THead>
              <TBody>
                {brokenRows.map((r) => (
                  <TR key={`broken-${r.customerId}`} hover={false}>
                    <TD>
                      <Link
                        href={`/customers/${r.customerId}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {r.customerName}
                      </Link>
                    </TD>
                    <TD num neg>
                      {r.brokenPromise?.promiseDate
                        ? formatDate(r.brokenPromise.promiseDate)
                        : "—"}
                    </TD>
                    <TD num>
                      {r.brokenPromise?.amount
                        ? formatMoney(r.brokenPromise.amount, baseCode, { compact: true })
                        : "—"}
                    </TD>
                    <TD style={{ color: "var(--ink-3)" }}>
                      {r.brokenPromise?.notes ?? "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        <Card title="Overdue clients">
          {rows.length === 0 ? (
            <Empty title="No overdue AR" body="Nothing to chase right now." />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Client</TH>
                  <TH num>Oldest age</TH>
                  <TH num>Total overdue</TH>
                  <TH>Last activity</TH>
                  <TH>Next promise</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.customerId} hover={false}>
                    <TD>
                      <Link
                        href={`/customers/${r.customerId}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {r.customerName}
                      </Link>
                      {r.brokenPromise && (
                        <span className="ml-2">
                          <Pill variant="review">broken promise</Pill>
                        </span>
                      )}
                    </TD>
                    <TD num neg={r.oldestAgeDays > 60}>
                      {r.oldestAgeDays}d
                    </TD>
                    <TD num>
                      {formatMoney(r.totalOverdue, baseCode, { compact: true, paren: true })}
                    </TD>
                    <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                      {r.lastActivity
                        ? `${r.lastActivity.kind} · ${formatDate(r.lastActivity.activityDate)}`
                        : "—"}
                    </TD>
                    <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                      {r.nextPromise?.promiseDate
                        ? formatDate(r.nextPromise.promiseDate)
                        : "—"}
                    </TD>
                    <TD>
                      <Link
                        href={`/customers/${r.customerId}#collections`}
                        style={{ color: "var(--ink)", fontSize: 11.5 }}
                      >
                        Log →
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
