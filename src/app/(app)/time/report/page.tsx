import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getCustomers,
  getEntities,
  getEntityFees,
  getTimeEntries,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { parseAmount } from "@/lib/money";
import { invoiceOverageAction } from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; error?: string }>;
}) {
  const params = await searchParams;
  const year = params.year ? parseInt(params.year, 10) : new Date().getFullYear();

  const [entries, fees, entities, customers, user] = await Promise.all([
    getTimeEntries(),
    getEntityFees(),
    getEntities(),
    getCustomers(),
    getSessionUser(),
  ]);
  const canInvoice = hasPermission(user, "invoice.create");
  const customerById = new Map(customers.map((c) => [c.id, c] as const));
  const entityById = new Map(entities.map((e) => [e.id, e] as const));

  // Bucket hours per entity for the chosen year
  const hoursByEntity = new Map<string, number>();
  let unassignedBillable = 0;
  for (const t of entries) {
    if (!t.entryDate.startsWith(String(year))) continue;
    const hrs = parseAmount(t.durationHours);
    if (t.entityId) {
      hoursByEntity.set(t.entityId, (hoursByEntity.get(t.entityId) ?? 0) + hrs);
    } else if (t.isBillable) {
      unassignedBillable += hrs;
    }
  }

  // Pair entity fees with utilization
  type Row = {
    feeId: string;
    entityId: string;
    entityCode: string;
    entityName: string;
    clientName: string;
    includedHours: number;
    loggedHours: number;
    usagePct: number;
    overage: number;
    status: string;
  };
  const rows: Row[] = [];
  for (const f of fees) {
    if (f.billingYear !== year) continue;
    const ent = entityById.get(f.entityId);
    if (!ent) continue;
    const client = customerById.get(ent.clientId);
    const inc = parseAmount(f.includedHours);
    const logged = hoursByEntity.get(f.entityId) ?? 0;
    rows.push({
      feeId: f.id,
      entityId: f.entityId,
      entityCode: ent.code,
      entityName: ent.name,
      clientName: client?.name ?? "—",
      includedHours: inc,
      loggedHours: logged,
      usagePct: inc > 0 ? (logged / inc) * 100 : 0,
      overage: Math.max(0, logged - inc),
      status: f.status,
    });
  }
  rows.sort((a, b) => b.usagePct - a.usagePct);

  const totalIncluded = rows.reduce((s, r) => s + r.includedHours, 0);
  const totalLogged = rows.reduce((s, r) => s + r.loggedHours, 0);
  const totalOverage = rows.reduce((s, r) => s + r.overage, 0);

  function statusPill(pct: number) {
    if (pct >= 100) return <Pill variant="review">Over included</Pill>;
    if (pct >= 75) return <Pill variant="pending">Approaching</Pill>;
    return <Pill variant="active">Within</Pill>;
  }

  return (
    <>
      <PageHeader
        title="Utilization vs included hours"
        meta={`Billing year ${year} · ${rows.length} entities`}
      />

      {params.error && (
        <div className="px-6 mt-3.5">
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {params.error}
          </div>
        </div>
      )}

      <div className="px-6 my-3.5 grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <Tile label="Included hrs" value={totalIncluded.toFixed(0)} />
        <Tile label="Logged hrs" value={totalLogged.toFixed(2)} />
        <Tile
          label="Overage hrs"
          value={totalOverage.toFixed(2)}
          neg={totalOverage > 0}
        />
        <Tile
          label="Unassigned billable"
          value={unassignedBillable.toFixed(2)}
          sub="No entity selected"
        />
      </div>

      <div className="px-6 pb-8 flex flex-col gap-3.5">
        <Card title={`Hours per entity (${year})`}>
          {rows.length === 0 ? (
            <Empty
              title="No fee assignments for this year"
              body="Assign annual fees on /fees to populate this report."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Entity</TH>
                  <TH>Client</TH>
                  <TH num>Included</TH>
                  <TH num>Logged</TH>
                  <TH num>Usage %</TH>
                  <TH num>Overage</TH>
                  <TH>Status</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.feeId}>
                    <TD>
                      <Link
                        href={`/entities/${r.entityId}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {r.entityCode} — {r.entityName}
                      </Link>
                    </TD>
                    <TD style={{ color: "var(--ink-3)" }}>{r.clientName}</TD>
                    <TD num>{r.includedHours.toFixed(0)}</TD>
                    <TD num>{r.loggedHours.toFixed(2)}</TD>
                    <TD num style={{ color: r.usagePct >= 100 ? "var(--p-review-fg)" : undefined }}>
                      {r.usagePct.toFixed(0)}%
                    </TD>
                    <TD num neg={r.overage > 0}>
                      {r.overage > 0 ? r.overage.toFixed(2) : "—"}
                    </TD>
                    <TD>{statusPill(r.usagePct)}</TD>
                    <TD>
                      {r.overage > 0 && canInvoice && (
                        <form action={invoiceOverageAction}>
                          <input type="hidden" name="entityFeeId" value={r.feeId} />
                          <input type="hidden" name="year" value={String(year)} />
                          <Button variant="secondary" type="submit">
                            Invoice overage
                          </Button>
                        </form>
                      )}
                    </TD>
                  </TR>
                ))}
                <TR total hover={false}>
                  <TD colSpan={2}>Totals</TD>
                  <TD num>{totalIncluded.toFixed(0)}</TD>
                  <TD num>{totalLogged.toFixed(2)}</TD>
                  <TD num>{""}</TD>
                  <TD num>{totalOverage.toFixed(2)}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                </TR>
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

function Tile({
  label,
  value,
  sub,
  neg,
}: {
  label: string;
  value: string;
  sub?: string;
  neg?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-3.5"
      style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
    >
      <div className="uppercase" style={{ fontSize: 10.5, letterSpacing: "0.04em", color: "var(--ink-3)" }}>
        {label}
      </div>
      <div
        className="mt-1"
        style={{
          fontSize: 22,
          color: neg ? "var(--p-review-fg)" : "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
