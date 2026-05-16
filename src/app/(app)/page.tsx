import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  convertToBase,
  getApAging,
  getArAging,
  getBaseCurrency,
  getBills,
  getCustomers,
  getDueRecurringTemplateCount,
  getEntities,
  getEntityPlRollup,
  getInvoices,
  getInvoicesAwaitingApproval,
  getJournalEntries,
  getKpis,
  getLatestFxRates,
  getVendors,
} from "@/lib/data";
import { formatAmount, formatMoney } from "@/lib/money";
import { DrillNumber } from "@/components/DrillNumber";
import { parseAmount } from "@/lib/money";
import { resolveEntityScope } from "@/lib/entity-scope";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import {
  ensureAccountingPeriods,
  getAccountingPeriods,
} from "@/lib/periods";
import type { AccountingPeriodStatus } from "@/lib/types";
import { closePeriodAction } from "./settings/periods/actions";

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
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const body = (
    <div
      className="rounded-lg p-3.5 kpi-tile"
      style={{
        border: "1px solid var(--line)",
        background: "var(--raised)",
        cursor: href ? "pointer" : "default",
        height: "100%",
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
  if (!href) return body;
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}>
      {body}
    </Link>
  );
}

function AgingRow({
  label,
  amount,
  neg,
  href,
}: {
  label: string;
  amount: number;
  neg?: boolean;
  href?: string;
}) {
  return (
    <TR href={href}>
      <TD>
        {href ? (
          <Link href={href} style={{ color: "var(--ink-2)", textDecoration: "none" }}>
            {label}
          </Link>
        ) : (
          label
        )}
      </TD>
      <TD num neg={neg && amount > 0}>
        <DrillNumber
          value={amount}
          href={href}
          currencyCode={null}
          neg={neg && amount > 0}
          compact
        />
      </TD>
    </TR>
  );
}

export default async function Page() {
  const user = await getSessionUser();
  const role = user?.role ?? "Demo";

  // Auto-seed accounting periods on first dashboard load so the widget
  // below always has rows. Safe to re-call — only inserts what's missing.
  await ensureAccountingPeriods(new Date().getUTCFullYear());

  // Topbar firm-entity scope drives the same filter on KPIs, P&L, and
  // aging. Reading the cookie once here means every helper that takes
  // a scope sees the same value. Supports office or region selection.
  const firmScope = await resolveEntityScope();
  const plScope = firmScope;

  const today = new Date();
  const demoTodayIso = today.toISOString().slice(0, 10);
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
    accountingPeriods,
    dueTemplateCount,
  ] = await Promise.all([
    getKpis(),
    getArAging(today),
    getApAging(today),
    getJournalEntries(),
    getBills(),
    getInvoices(),
    getCustomers(),
    getVendors(),
    getEntities(),
    getEntityPlRollup(plScope),
    getBaseCurrency(),
    getLatestFxRates(),
    user
      ? getInvoicesAwaitingApproval(user.userId, user.role, user.isSuperuser)
      : Promise.resolve([]),
    getAccountingPeriods(),
    getDueRecurringTemplateCount(demoTodayIso),
  ]);

  // Widget data: pick the current period plus the two preceding ones so the
  // user sees recent close history at a glance.
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentIdx = accountingPeriods.findIndex(
    (p) => todayIso >= p.startDate && todayIso <= p.endDate,
  );
  const fallbackEnd =
    currentIdx >= 0
      ? currentIdx
      : Math.max(0, accountingPeriods.length - 1);
  const recentPeriods = accountingPeriods
    .slice(Math.max(0, fallbackEnd - 2), fallbackEnd + 1)
    .reverse(); // newest first
  const currentOpenPeriod =
    currentIdx >= 0 && accountingPeriods[currentIdx]?.status === "open"
      ? accountingPeriods[currentIdx]
      : null;
  function periodStatusVariant(status: AccountingPeriodStatus) {
    if (status === "open") return "active" as const;
    if (status === "closed") return "pending" as const;
    return "review" as const;
  }
  function periodStatusLabel(status: AccountingPeriodStatus) {
    if (status === "open") return "Open";
    if (status === "closed") return "Closed";
    return "Locked";
  }
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
  // Firm-level (no entityId) row keeps the per-entity P&L card's rows
  // summing to the KPI tile above it. Without this the dashboard shows
  // Net Income X but a sub-table whose rows add to <X, which is the
  // "doesn't add up" complaint.
  const firmLevelPl = plRollup.find((r) => r.entityId == null);
  const firmLevelNet = firmLevelPl?.netIncome ?? 0;
  const totalNetBase =
    entityPlRows.reduce((s, r) => s + r.netBase, 0) + firmLevelNet;

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
      return due.getTime() < today.getTime();
    })
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <>
      <PageHeader
        title="Dashboard"
        meta={`${formatLongDate(today)} · ${role} view`}
        actions={
          <>
            <ButtonLink variant="secondary" href="/reports">
              Reports
            </ButtonLink>
            {hasPermission(user, "journal_entry.create") && (
              <ButtonLink variant="primary" href="/journal/new">
                + New entry
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="px-6 my-3.5">
        <div className="flex flex-wrap gap-1.5">
          {hasPermission(user, "settings.write") && (
            <ButtonLink variant="secondary" href="/entities/new">
              + New entity
            </ButtonLink>
          )}
          {hasPermission(user, "journal_entry.create") && (
            <ButtonLink variant="secondary" href="/time/new">
              + Log time
            </ButtonLink>
          )}
          {hasPermission(user, "invoice.create") && (
            <ButtonLink variant="secondary" href="/invoices/new">
              + New invoice
            </ButtonLink>
          )}
          {hasPermission(user, "bill.create") && (
            <ButtonLink variant="secondary" href="/bills/new">
              + New bill
            </ButtonLink>
          )}
          {hasPermission(user, "settings.write") && (
            <ButtonLink variant="secondary" href="/contacts/new">
              + New contact
            </ButtonLink>
          )}
        </div>
      </div>

      {dueTemplateCount > 0 && (
        <div className="px-6 my-3.5">
          <Card
            title="Recurring entries due"
            actions={
              <Link
                href="/journal?view=templates"
                style={{ color: "var(--ink-3)", textDecoration: "none" }}
              >
                Review templates →
              </Link>
            }
          >
            <div className="flex items-center gap-3" style={{ padding: "8px 4px" }}>
              <Pill variant="pending">
                {dueTemplateCount} template
                {dueTemplateCount === 1 ? "" : "s"} due
              </Pill>
              <span style={{ color: "var(--ink-3)", fontSize: 12.5 }}>
                Open the Templates tab on Journal Entries to generate the next
                draft.
              </span>
            </div>
          </Card>
        </div>
      )}

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
                  <TR key={inv.id} href={`/invoices/${inv.id}`}>
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
                    <TD num>
                      <DrillNumber
                        value={inv.total}
                        href={`/invoices/${inv.id}`}
                        currencyCode={null}
                        compact
                      />
                    </TD>
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
          label={`Total Assets (${baseCode})`}
          value={formatMoney(kpis.assets, baseCode, { paren: true, compact: true, hideCurrency: true })}
          sub="All asset accounts"
          href="/reports?tab=balance"
        />
        <Tile
          label={`Total Liabilities (${baseCode})`}
          value={formatMoney(kpis.liabilities, baseCode, { paren: true, compact: true, hideCurrency: true })}
          sub="All liability accounts"
          href="/reports?tab=balance"
        />
        <Tile
          label={`Net Income YTD (${baseCode})`}
          value={formatMoney(kpis.netIncome, baseCode, { paren: true, compact: true, hideCurrency: true })}
          sub="Revenue minus expense"
          href="/reports?tab=income"
        />
        <Tile
          label={`Cash Balance (${baseCode})`}
          value={formatMoney(kpis.cash, baseCode, { paren: true, compact: true, hideCurrency: true })}
          sub="Account 1000 — Cash"
          href="/bank"
        />
      </div>

      {(entityPlRows.length > 0 || firmLevelNet !== 0) && (
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
                  <TR key={r.entityId} href={`/entities/${r.entityId}/books`}>
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
                      {formatAmount(r.netNative, { paren: true, compact: true })}
                    </TD>
                    <TD num neg={r.netBase < 0}>
                      {formatAmount(r.netBase, { paren: true, compact: true })}
                    </TD>
                  </TR>
                ))}
                {firmLevelNet !== 0 && (
                  // Firm-level activity has no entityId — show it as its
                  // own row so the visible rows sum to the Net Income tile
                  // above. Drill target is the journal list filtered to
                  // firm-only entries.
                  <TR href="/journal?entity=firm" hover>
                    <TD style={{ color: "var(--ink-3)" }}>
                      <Link
                        href="/journal?entity=firm"
                        style={{ color: "var(--ink-3)", textDecoration: "none" }}
                      >
                        Firm-level (unattributed)
                      </Link>
                    </TD>
                    <TD mono style={{ color: "var(--ink-3)" }}>{baseCode}</TD>
                    <TD num neg={firmLevelNet < 0}>
                      {formatAmount(firmLevelNet, { paren: true, compact: true })}
                    </TD>
                    <TD num neg={firmLevelNet < 0}>
                      {formatAmount(firmLevelNet, { paren: true, compact: true })}
                    </TD>
                  </TR>
                )}
                <TR total hover={false}>
                  <TD colSpan={3} style={{ fontWeight: 600 }}>
                    Total
                  </TD>
                  <TD num neg={totalNetBase < 0} style={{ fontWeight: 600 }}>
                    {formatAmount(totalNetBase, { paren: true, compact: true })}
                  </TD>
                </TR>
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
              <AgingRow
                label="Current"
                amount={ar.current}
                href="/invoices?bucket=current"
              />
              <AgingRow
                label="1–30 days"
                amount={ar.d30}
                href="/invoices?bucket=d30"
              />
              <AgingRow
                label="31–60 days"
                amount={ar.d60}
                href="/invoices?bucket=d60"
              />
              <AgingRow
                label="60+ days"
                amount={ar.d90}
                neg
                href="/invoices?bucket=d90"
              />
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
              <AgingRow
                label="Current"
                amount={ap.current}
                href="/bills?bucket=current"
              />
              <AgingRow
                label="1–30 days"
                amount={ap.d30}
                href="/bills?bucket=d30"
              />
              <AgingRow
                label="31–60 days"
                amount={ap.d60}
                href="/bills?bucket=d60"
              />
              <AgingRow
                label="60+ days"
                amount={ap.d90}
                neg
                href="/bills?bucket=d90"
              />
            </TBody>
          </Table>
        </Card>
      </div>

      {recentPeriods.length > 0 && (
        <div className="px-6 mb-3.5">
          <Card
            title="Period status"
            actions={
              <Link
                href="/settings/periods"
                style={{ color: "var(--ink-3)", textDecoration: "none" }}
              >
                Manage periods →
              </Link>
            }
          >
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Period</TH>
                  <TH>Date range</TH>
                  <TH>Status</TH>
                  <TH>Closed</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {recentPeriods.map((p) => {
                  const isCurrent =
                    todayIso >= p.startDate && todayIso <= p.endDate;
                  return (
                    <TR key={p.id}>
                      <TD>
                        {p.name}
                        {isCurrent && (
                          <span
                            className="ml-2 text-[10.5px] uppercase"
                            style={{
                              color: "var(--ink-4)",
                              letterSpacing: "0.04em",
                            }}
                          >
                            (current)
                          </span>
                        )}
                      </TD>
                      <TD>
                        {formatShortDate(p.startDate)} – {formatShortDate(p.endDate)}
                      </TD>
                      <TD>
                        <Pill variant={periodStatusVariant(p.status)}>
                          {periodStatusLabel(p.status)}
                        </Pill>
                      </TD>
                      <TD>
                        {p.closedAt
                          ? new Date(p.closedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              timeZone: "UTC",
                            })
                          : "—"}
                      </TD>
                      <TD>
                        {currentOpenPeriod && currentOpenPeriod.id === p.id ? (
                          <form action={closePeriodAction}>
                            <input type="hidden" name="periodId" value={p.id} />
                            <button
                              type="submit"
                              className="text-[12px]"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--ink-2)",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              Close period →
                            </button>
                          </form>
                        ) : (
                          <span style={{ color: "var(--ink-4)" }}>—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        </div>
      )}

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
                <TR key={je.id} href={`/journal/${je.entryNumber}`}>
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
                  <TR key={b.id} href={`/bills/${b.id}`}>
                    <TD mono>{b.billNumber}</TD>
                    <TD>{vendor?.name ?? "—"}</TD>
                    <TD>{formatShortDate(b.dueDate)}</TD>
                    <TD num>
                      <DrillNumber
                        value={bal}
                        href={`/bills/${b.id}`}
                        currencyCode={null}
                        compact
                      />
                    </TD>
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
                    <TR key={inv.id} href={`/invoices/${inv.id}`}>
                      <TD mono>{inv.invoiceNumber}</TD>
                      <TD>{customer?.name ?? "—"}</TD>
                      <TD>{formatShortDate(inv.dueDate)}</TD>
                      <TD num neg>
                        <DrillNumber
                          value={bal}
                          href={`/invoices/${inv.id}`}
                          currencyCode={null}
                          neg
                          compact
                        />
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
