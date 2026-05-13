import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  DEMO_TODAY,
  convertToBase,
  getApAging,
  getArAging,
  getBaseCurrency,
  getBills,
  getCustomers,
  getEntities,
  getEntityPlRollup,
  getInvoices,
  getInvoicesAwaitingApproval,
  getJournalEntries,
  getKpis,
  getLatestFxRates,
  getVendors,
} from "@/lib/data";
import { formatAmount, formatUSD } from "@/lib/money";
import { parseAmount } from "@/lib/money";
import { getSessionUser } from "@/lib/session";

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-lg p-3.5"
      style={{
        border: "1px solid var(--line)",
        background: "var(--raised)",
      }}
    >
      <div
        className="uppercase"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.04em",
          color: "var(--ink-3)",
        }}
      >
        {label}
      </div>
      <div
        className="mt-1"
        style={{
          fontSize: 22,
          color: "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-1"
          style={{ fontSize: 11.5, color: "var(--ink-4)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function AgingRow({
  label,
  amount,
  neg,
}: {
  label: string;
  amount: number;
  neg?: boolean;
}) {
  return (
    <TR>
      <TD>{label}</TD>
      <TD num neg={neg && amount > 0}>
        {formatUSD(amount, { paren: true })}
      </TD>
    </TR>
  );
}

export default async function Page() {
  const user = await getSessionUser();
  const role = user?.role ?? "Demo";

  const [
    kpis,
    ar,
    ap,
    allEntries,
    allBills,
    allInvoices,
    customers,
    vendors,
    entities,
    plRollup,
    base,
    fxRates,
    awaitingApproval,
  ] = await Promise.all([
    getKpis(),
    getArAging(DEMO_TODAY),
    getApAging(DEMO_TODAY),
    getJournalEntries(),
    getBills(),
    getInvoices(),
    getCustomers(),
    getVendors(),
    getEntities(),
    getEntityPlRollup(),
    getBaseCurrency(),
    getLatestFxRates(),
    user
      ? getInvoicesAwaitingApproval(user.userId, user.role, user.isSuperuser)
      : Promise.resolve([]),
  ]);
  const entityById = new Map(entities.map((e) => [e.id, e] as const));
  const baseCode = base?.code ?? "USD";
  const baseSymbol = base?.symbol ?? "$";
  const entityPlRows = plRollup
    .filter((r) => r.entityId != null)
    .map((r) => {
      const ent = entityById.get(r.entityId!);
      const ccy = ent?.currencyCode ?? baseCode;
      const conv = (n: number) =>
        ccy === baseCode ? n : (convertToBase(n, ccy, fxRates) ?? 0);
      return {
        entityId: r.entityId!,
        entity: ent,
        ccy,
        netNative: r.netIncome,
        netBase: conv(r.netIncome),
      };
    })
    .sort((a, b) => b.netBase - a.netBase);

  const customerById = new Map(customers.map((c) => [c.id, c] as const));
  const vendorById = new Map(vendors.map((v) => [v.id, v] as const));

  const recentJes = allEntries.slice(0, 8);

  const upcomingBills = allBills
    .filter((b) => parseAmount(b.balanceDue) > 0)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  const overdueInvoices = allInvoices
    .filter((i) => {
      const bal = parseAmount(i.balanceDue);
      if (bal <= 0) return false;
      const due = new Date(`${i.dueDate}T00:00:00Z`);
      return due.getTime() < DEMO_TODAY.getTime();
    })
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <>
      <PageHeader
        title="Dashboard"
        meta={`${formatLongDate(DEMO_TODAY)} · ${role} view`}
        actions={
          <>
            <ButtonLink variant="secondary" href="/reports">
              Reports
            </ButtonLink>
            <ButtonLink variant="primary" href="/journal/new">
              + New entry
            </ButtonLink>
          </>
        }
      />

      {awaitingApproval.length > 0 && (
        <div className="px-6 my-3.5">
          <Card
            title={`Awaiting your approval — ${awaitingApproval.length}`}
            actions={
              <Pill variant="pending">
                {awaitingApproval.length} invoice{awaitingApproval.length === 1 ? "" : "s"}
              </Pill>
            }
          >
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Invoice #</TH>
                  <TH>Customer</TH>
                  <TH>Stage</TH>
                  <TH num>Total</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {awaitingApproval.map((inv) => (
                  <TR key={inv.id}>
                    <TD mono>
                      <Link
                        href={`/invoices/${inv.id}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </TD>
                    <TD>{inv.customerName}</TD>
                    <TD>
                      <Pill variant={statusVariant(inv.status)}>
                        {statusLabel(inv.status)}
                      </Pill>
                    </TD>
                    <TD num>{formatUSD(inv.total)}</TD>
                    <TD>
                      <Link
                        href={`/invoices/${inv.id}`}
                        style={{ color: "var(--ink-3)", textDecoration: "none" }}
                      >
                        Review →
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 px-6 my-3.5">
        <Tile
          label="Total Assets"
          value={formatUSD(kpis.assets, { paren: true })}
          sub="All asset accounts"
        />
        <Tile
          label="Total Liabilities"
          value={formatUSD(kpis.liabilities, { paren: true })}
          sub="All liability accounts"
        />
        <Tile
          label="Net Income (YTD)"
          value={formatUSD(kpis.netIncome, { paren: true })}
          sub="Revenue minus expense"
        />
        <Tile
          label="Cash Balance"
          value={formatUSD(kpis.cash, { paren: true })}
          sub="Account 1000 — Cash"
        />
      </div>

      {entityPlRows.length > 0 && (
        <div className="px-6 mb-3.5">
          <Card
            title="Per-entity P&L (YTD, posted)"
            actions={
              <Link
                href="/consolidation"
                style={{ color: "var(--ink-3)", textDecoration: "none" }}
              >
                Consolidation →
              </Link>
            }
          >
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Entity</TH>
                  <TH>Ccy</TH>
                  <TH num>Net (native)</TH>
                  <TH num>Net ({baseCode})</TH>
                </TR>
              </THead>
              <TBody>
                {entityPlRows.map((r) => (
                  <TR key={r.entityId}>
                    <TD>
                      <Link
                        href={`/entities/${r.entityId}/books`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {r.entity?.code ?? r.entityId} — {r.entity?.name ?? "—"}
                      </Link>
                    </TD>
                    <TD mono>{r.ccy}</TD>
                    <TD num neg={r.netNative < 0}>
                      {formatAmount(r.netNative, { paren: true })}
                    </TD>
                    <TD num neg={r.netBase < 0}>
                      {baseSymbol}
                      {formatAmount(r.netBase, { paren: true })}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 px-6 mb-3.5">
        <Card
          title="Accounts Receivable aging"
          actions={
            <Link
              href="/invoices"
              style={{ color: "var(--ink-3)", textDecoration: "none" }}
            >
              View invoices →
            </Link>
          }
        >
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Bucket</TH>
                <TH num>Balance</TH>
              </TR>
            </THead>
            <TBody>
              <AgingRow label="Current" amount={ar.current} />
              <AgingRow label="1–30 days" amount={ar.d30} />
              <AgingRow label="31–60 days" amount={ar.d60} />
              <AgingRow label="60+ days" amount={ar.d90} neg />
            </TBody>
          </Table>
        </Card>

        <Card
          title="Accounts Payable aging"
          actions={
            <Link
              href="/bills"
              style={{ color: "var(--ink-3)", textDecoration: "none" }}
            >
              View bills →
            </Link>
          }
        >
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Bucket</TH>
                <TH num>Balance</TH>
              </TR>
            </THead>
            <TBody>
              <AgingRow label="Current" amount={ap.current} />
              <AgingRow label="1–30 days" amount={ap.d30} />
              <AgingRow label="31–60 days" amount={ap.d60} />
              <AgingRow label="60+ days" amount={ap.d90} neg />
            </TBody>
          </Table>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 px-6 mb-3.5">
        <Card
          title="Recent journal entries"
          actions={
            <Link
              href="/journal"
              style={{ color: "var(--ink-3)", textDecoration: "none" }}
            >
              All entries →
            </Link>
          }
        >
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Entry #</TH>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {recentJes.map((je) => (
                <TR key={je.id}>
                  <TD mono>
                    <Link
                      href={`/journal/${je.entryNumber}`}
                      style={{ color: "var(--ink)", textDecoration: "none" }}
                    >
                      {je.entryNumber}
                    </Link>
                  </TD>
                  <TD>{formatShortDate(je.entryDate)}</TD>
                  <TD>{je.description ?? ""}</TD>
                  <TD>
                    <Pill variant={statusVariant(je.status)}>
                      {statusLabel(je.status)}
                    </Pill>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card
          title="Upcoming bills due"
          actions={
            <Link
              href="/bills"
              style={{ color: "var(--ink-3)", textDecoration: "none" }}
            >
              All bills →
            </Link>
          }
        >
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Bill #</TH>
                <TH>Vendor</TH>
                <TH>Due</TH>
                <TH num>Balance</TH>
              </TR>
            </THead>
            <TBody>
              {upcomingBills.map((b) => {
                const vendor = vendorById.get(b.vendorId);
                const bal = parseAmount(b.balanceDue);
                return (
                  <TR key={b.id}>
                    <TD mono>{b.billNumber}</TD>
                    <TD>{vendor?.name ?? "—"}</TD>
                    <TD>{formatShortDate(b.dueDate)}</TD>
                    <TD num>{formatUSD(bal, { paren: true })}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      </div>

      {overdueInvoices.length > 0 && (
        <div className="px-6 mb-8">
          <Card
            title="Overdue invoices"
            actions={
              <Pill variant="review">
                {overdueInvoices.length} overdue
              </Pill>
            }
          >
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Invoice #</TH>
                  <TH>Customer</TH>
                  <TH>Due</TH>
                  <TH num>Balance</TH>
                </TR>
              </THead>
              <TBody>
                {overdueInvoices.map((inv) => {
                  const customer = customerById.get(inv.customerId);
                  const bal = parseAmount(inv.balanceDue);
                  return (
                    <TR key={inv.id}>
                      <TD mono>{inv.invoiceNumber}</TD>
                      <TD>{customer?.name ?? "—"}</TD>
                      <TD>{formatShortDate(inv.dueDate)}</TD>
                      <TD num neg>
                        {formatUSD(bal, { paren: true })}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
