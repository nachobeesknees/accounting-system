import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  SmartSelect,
  type SmartSelectOption,
} from "@/components/ui/SmartSelect";
import { DrillNumber } from "@/components/DrillNumber";
import { PrintButton } from "@/components/PrintButton";
import { CsvDownloadButton } from "@/components/CsvDownloadButton";
import { GlTieOut, ReconcilingItemsCard } from "@/components/AgingTieOut";
import {
  getAllCustomerAssignments,
  getBaseCurrency,
  getCustomers,
  getEntities,
  getInvoices,
  getSubledgerReconciliation,
  getUsers,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { formatMoney, parseAmount } from "@/lib/money";

type Bucket = "current" | "d30" | "d60" | "d90" | "d90p";

const BUCKET_HEADERS: Array<{ key: Bucket; label: string }> = [
  { key: "current", label: "Current" },
  { key: "d30", label: "1–30 days" },
  { key: "d60", label: "31–60 days" },
  { key: "d90", label: "61–90 days" },
  { key: "d90p", label: "90+ days" },
];

const BUCKET_LABEL: Record<Bucket, string> = {
  current: "Current",
  d30: "1–30",
  d60: "31–60",
  d90: "61–90",
  d90p: "90+",
};

const EMPTY_BUCKETS = (): Record<Bucket, number> => ({
  current: 0,
  d30: 0,
  d60: 0,
  d90: 0,
  d90p: 0,
});

function bucketFor(daysOverdue: number): Bucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  if (daysOverdue <= 90) return "d90";
  return "d90p";
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; employee?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "mine" ? "mine" : "all";
  const employeeFilter = params.employee ?? "";

  const today = new Date();
  const asOf = today.toISOString().slice(0, 10);
  const sessionUser = await getSessionUser();

  const [invoices, customers, entities, allAssignments, users, base, recon] =
    await Promise.all([
      getInvoices(),
      getCustomers(),
      getEntities(),
      getAllCustomerAssignments(),
      getUsers(),
      getBaseCurrency(),
      getSubledgerReconciliation("ar", new Date().toISOString().slice(0, 10)),
    ]);
  const baseCode = base?.code ?? "USD";

  const customersById = new Map(customers.map((c) => [c.id, c] as const));
  const entitiesById = new Map(entities.map((e) => [e.id, e] as const));
  const usersById = new Map(users.map((u) => [u.id, u] as const));

  // Build userId → Set<customerId> and customerId → Set<userId>
  const customersByUser = new Map<string, Set<string>>();
  const usersByCustomer = new Map<string, Set<string>>();
  for (const a of allAssignments) {
    if (!customersByUser.has(a.userId)) customersByUser.set(a.userId, new Set());
    customersByUser.get(a.userId)!.add(a.customerId);
    if (!usersByCustomer.has(a.customerId))
      usersByCustomer.set(a.customerId, new Set());
    usersByCustomer.get(a.customerId)!.add(a.userId);
  }

  // Resolve which customers should pass the filter, given the view + employee
  // dropdown. "mine" narrows to the logged-in user's customers; the employee
  // dropdown can ALSO narrow to a specific other employee's customers
  // (admin/CFO supervision view).
  const effectiveEmployeeId =
    employeeFilter !== ""
      ? employeeFilter
      : view === "mine"
        ? (sessionUser?.userId ?? null)
        : null;
  const allowedCustomerIds = effectiveEmployeeId
    ? customersByUser.get(effectiveEmployeeId) ?? new Set<string>()
    : null;

  // Aggregate per client × CURRENCY so bucket cells never mix currencies.
  // Each row's amounts are native to its currency; the totals block shows
  // one native row per currency plus a base-converted grand total using
  // each document's fxRate snapshot (base = native / fxRate; NULL = base).
  type ClientAgingRow = {
    clientId: string;
    clientName: string;
    currencyCode: string;
    buckets: Record<Bucket, number>;
    total: number;
    totalBase: number;
  };
  const byClientCurrency = new Map<string, ClientAgingRow>();

  type FlatRow = {
    id: string;
    invoiceNumber: string;
    clientId: string;
    clientName: string;
    entityName: string;
    invoiceDate: string;
    dueDate: string;
    daysOverdue: number;
    bucket: Bucket;
    balanceDue: number;
    balanceDueBase: number;
    currencyCode: string;
    status: string;
  };
  const flatRows: FlatRow[] = [];
  let totalReceivableBase = 0;

  // Per-currency totals (native) + base-converted totals per bucket.
  const totalsByCurrency = new Map<
    string,
    { buckets: Record<Bucket, number>; total: number }
  >();
  const totalsBase: Record<Bucket, number> = EMPTY_BUCKETS();

  for (const inv of invoices) {
    const balance = parseAmount(inv.balanceDue);
    if (balance <= 0) continue;
    if (inv.status === "void" || inv.status === "paid") continue;
    if (allowedCustomerIds && !allowedCustomerIds.has(inv.customerId)) continue;

    const due = new Date(`${inv.dueDate}T00:00:00Z`);
    const daysOverdue = daysBetween(due, today);
    const bucket = bucketFor(daysOverdue);

    const client = customersById.get(inv.customerId);
    const ent = inv.entityId ? entitiesById.get(inv.entityId) : null;

    const fx = inv.fxRate == null ? null : parseAmount(inv.fxRate);
    const balanceBase = fx != null && fx > 0 ? balance / fx : balance;

    const rowKey = `${inv.customerId}|${inv.currencyCode}`;
    const existing =
      byClientCurrency.get(rowKey) ??
      ({
        clientId: inv.customerId,
        clientName: client?.name ?? "—",
        currencyCode: inv.currencyCode,
        buckets: EMPTY_BUCKETS(),
        total: 0,
        totalBase: 0,
      } as ClientAgingRow);
    existing.buckets[bucket] += balance;
    existing.total += balance;
    existing.totalBase += balanceBase;
    byClientCurrency.set(rowKey, existing);

    const curTotals =
      totalsByCurrency.get(inv.currencyCode) ??
      ({ buckets: EMPTY_BUCKETS(), total: 0 });
    curTotals.buckets[bucket] += balance;
    curTotals.total += balance;
    totalsByCurrency.set(inv.currencyCode, curTotals);

    totalsBase[bucket] += balanceBase;
    totalReceivableBase += balanceBase;

    flatRows.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientId: inv.customerId,
      clientName: client?.name ?? "—",
      entityName: ent?.name ?? "—",
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      daysOverdue,
      bucket,
      balanceDue: balance,
      balanceDueBase: balanceBase,
      currencyCode: inv.currencyCode,
      status: inv.status,
    });
  }

  const clientRows = Array.from(byClientCurrency.values()).sort((a, b) => {
    if (b.buckets.d90p !== a.buckets.d90p) return b.buckets.d90p - a.buckets.d90p;
    if (b.buckets.d90 !== a.buckets.d90) return b.buckets.d90 - a.buckets.d90;
    return b.totalBase - a.totalBase;
  });

  const currencyTotalRows = Array.from(totalsByCurrency.entries()).sort(
    ([a], [b]) => a.localeCompare(b),
  );

  flatRows.sort((a, b) => {
    if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
    return a.dueDate.localeCompare(b.dueDate);
  });

  // Employees who currently have any assignments — used to populate the
  // filter dropdown.
  const employeeOptions = users
    .filter((u) => customersByUser.has(u.id))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const baseParams = new URLSearchParams();
  if (employeeFilter) baseParams.set("employee", employeeFilter);
  const allHref = `/reports/ar-aging${baseParams.size > 0 ? `?${baseParams}` : ""}`;
  const mineParams = new URLSearchParams(baseParams);
  mineParams.set("view", "mine");
  const mineHref = `/reports/ar-aging?${mineParams}`;

  const viewerCustomerCount = sessionUser
    ? customersByUser.get(sessionUser.userId)?.size ?? 0
    : 0;

  const distinctClients = new Set(clientRows.map((r) => r.clientId)).size;

  return (
    <>
      <PageHeader
        title="AR Aging"
        meta={`As of ${asOf} · ${distinctClients} clients with open invoices · totals per currency + ${baseCode} equivalent`}
        actions={
          <>
            <ButtonLink
              href={allHref}
              variant={view === "all" ? "primary" : "secondary"}
            >
              All clients
            </ButtonLink>
            <ButtonLink
              href={mineHref}
              variant={view === "mine" ? "primary" : "secondary"}
            >
              My clients{sessionUser ? ` (${viewerCustomerCount})` : ""}
            </ButtonLink>
            <CsvDownloadButton report="ar-aging" />
            <PrintButton />
          </>
        }
      />

      <div
        className="px-6 py-2 flex gap-2 flex-wrap items-end no-print"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <form method="GET" className="flex gap-2 flex-wrap items-end">
          {view === "mine" && <input type="hidden" name="view" value="mine" />}
          <div className="flex flex-col gap-1">
            <span
              className="text-[11.5px]"
              style={{ color: "var(--ink-3)" }}
            >
              Employee
            </span>
            <SmartSelect
              name="employee"
              defaultValue={employeeFilter}
              options={[
                {
                  value: "",
                  label: view === "mine" ? "Me" : "All employees",
                },
                ...employeeOptions.map<SmartSelectOption>((u) => ({
                  value: u.id,
                  label: u.fullName,
                })),
              ]}
              emptyLabel={view === "mine" ? "Me" : "All employees"}
              clearable
              triggerStyle={{ minWidth: 200 }}
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md text-[12.5px] font-medium"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
              border: "1px solid var(--accent)",
              cursor: "pointer",
            }}
          >
            Apply
          </button>
          <ButtonLink variant="ghost" href="/reports/ar-aging">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 py-3.5 pb-8 flex flex-col gap-3.5">
        <GlTieOut
          recon={recon}
          subledgerLabel="AR subledger (open posted invoices)"
        />
        <ReconcilingItemsCard recon={recon} />

        <Card title="Aging by client · one row per client and currency">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Client</TH>
                <TH>Assigned to</TH>
                <TH>Currency</TH>
                {BUCKET_HEADERS.map((h) => (
                  <TH key={h.key} num>
                    {h.label}
                  </TH>
                ))}
                <TH num>Total open</TH>
              </TR>
            </THead>
            <TBody>
              {clientRows.length === 0 && (
                <TR hover={false}>
                  <TD colSpan={9} style={{ color: "var(--ink-3)" }}>
                    No open client receivables.
                  </TD>
                </TR>
              )}
              {clientRows.map((r) => {
                const assignedIds = usersByCustomer.get(r.clientId);
                const assignedNames = assignedIds
                  ? Array.from(assignedIds)
                      .map((uid) => usersById.get(uid)?.fullName)
                      .filter((s): s is string => !!s)
                      .join(", ")
                  : "";
                const clientInvoicesHref = `/invoices?customer=${encodeURIComponent(r.clientId)}`;
                return (
                  <TR key={`${r.clientId}|${r.currencyCode}`} hover={false}>
                    <TD>
                      <Link
                        href={clientInvoicesHref}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                        title="Show this client's invoices"
                      >
                        {r.clientName}
                      </Link>
                    </TD>
                    <TD>
                      <span style={{ color: "var(--ink-3)" }}>
                        {assignedNames || "—"}
                      </span>
                    </TD>
                    <TD mono>{r.currencyCode}</TD>
                    {BUCKET_HEADERS.map((h) => {
                      const v = r.buckets[h.key];
                      const href = `/invoices?customer=${encodeURIComponent(r.clientId)}&bucket=${h.key}`;
                      return (
                        <TD
                          key={h.key}
                          num
                          neg={h.key === "d90p" && v > 0}
                        >
                          {v === 0 ? (
                            "—"
                          ) : (
                            <DrillNumber
                              value={v}
                              href={href}
                              currencyCode={null}
                              compact
                              neg={h.key === "d90p" && v > 0}
                            />
                          )}
                        </TD>
                      );
                    })}
                    <TD num>
                      <DrillNumber
                        value={r.total}
                        href={clientInvoicesHref}
                        currencyCode={null}
                        compact
                        title={`≈ ${formatMoney(r.totalBase, baseCode, { compact: true, paren: true })}`}
                      />
                    </TD>
                  </TR>
                );
              })}
              {currencyTotalRows.map(([code, t]) => (
                <TR key={`total-${code}`} total hover={false}>
                  <TD>Totals ({code})</TD>
                  <TD>{""}</TD>
                  <TD mono>{code}</TD>
                  {BUCKET_HEADERS.map((h) => (
                    <TD key={h.key} num>
                      {t.buckets[h.key] === 0 ? (
                        "—"
                      ) : (
                        <DrillNumber
                          value={t.buckets[h.key]}
                          href={`/invoices?bucket=${h.key}`}
                          currencyCode={null}
                          compact
                        />
                      )}
                    </TD>
                  ))}
                  <TD num>
                    <DrillNumber
                      value={t.total}
                      href="/invoices"
                      currencyCode={null}
                      compact
                    />
                  </TD>
                </TR>
              ))}
              <TR total hover={false}>
                <TD>Total ({baseCode} equivalent)</TD>
                <TD>{""}</TD>
                <TD mono>{baseCode}</TD>
                {BUCKET_HEADERS.map((h) => (
                  <TD key={h.key} num>
                    <DrillNumber
                      value={totalsBase[h.key]}
                      href={`/invoices?bucket=${h.key}`}
                      currencyCode={null}
                      compact
                      title="Converted per invoice with its fxRate snapshot"
                    />
                  </TD>
                ))}
                <TD num>
                  <DrillNumber
                    value={totalReceivableBase}
                    href="/invoices"
                    currencyCode={null}
                    compact
                    title="Converted per invoice with its fxRate snapshot"
                  />
                </TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        <Card title="Open invoices">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Invoice #</TH>
                <TH>Client</TH>
                <TH>Entity</TH>
                <TH>Invoice date</TH>
                <TH>Due</TH>
                <TH num>Days overdue</TH>
                <TH>Bucket</TH>
                <TH num>Balance (native)</TH>
                <TH num>≈ {baseCode}</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {flatRows.length === 0 && (
                <TR hover={false}>
                  <TD colSpan={10} style={{ color: "var(--ink-3)" }}>
                    No open invoices.
                  </TD>
                </TR>
              )}
              {flatRows.map((r) => {
                const isOverdue = r.daysOverdue > 0;
                return (
                  <TR key={r.id} href={`/invoices/${r.id}`}>
                    <TD mono>
                      <Link
                        href={`/invoices/${r.id}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {r.invoiceNumber}
                      </Link>
                    </TD>
                    <TD>{r.clientName}</TD>
                    <TD>{r.entityName}</TD>
                    <TD>{formatDate(r.invoiceDate)}</TD>
                    <TD>{formatDate(r.dueDate)}</TD>
                    <TD num neg={isOverdue}>
                      {r.daysOverdue <= 0 ? "—" : r.daysOverdue}
                    </TD>
                    <TD>{BUCKET_LABEL[r.bucket]}</TD>
                    <TD num neg={isOverdue}>
                      {formatMoney(r.balanceDue, r.currencyCode, {
                        compact: true,
                        paren: true,
                      })}
                    </TD>
                    <TD num>
                      {formatMoney(r.balanceDueBase, null, {
                        compact: true,
                        paren: true,
                        hideCurrency: true,
                      })}
                    </TD>
                    <TD>
                      <Pill variant={statusVariant(r.status)}>
                        {statusLabel(r.status)}
                      </Pill>
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
