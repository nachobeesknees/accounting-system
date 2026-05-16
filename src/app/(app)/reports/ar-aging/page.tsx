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
import {
  getAllCustomerAssignments,
  getCustomers,
  getEntities,
  getInvoices,
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
  const sessionUser = await getSessionUser();

  const [invoices, customers, entities, allAssignments, users] = await Promise.all([
    getInvoices(),
    getCustomers(),
    getEntities(),
    getAllCustomerAssignments(),
    getUsers(),
  ]);

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

  // Aggregate per-client buckets + flat row list of open invoices.
  type ClientAgingRow = {
    clientId: string;
    clientName: string;
    buckets: Record<Bucket, number>;
    total: number;
  };
  const byClient = new Map<string, ClientAgingRow>();

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
    status: string;
  };
  const flatRows: FlatRow[] = [];
  let totalReceivable = 0;

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

    const existing =
      byClient.get(inv.customerId) ??
      ({
        clientId: inv.customerId,
        clientName: client?.name ?? "—",
        buckets: { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 },
        total: 0,
      } as ClientAgingRow);
    existing.buckets[bucket] += balance;
    existing.total += balance;
    byClient.set(inv.customerId, existing);

    totalReceivable += balance;

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
      status: inv.status,
    });
  }

  const clientRows = Array.from(byClient.values()).sort((a, b) => {
    if (b.buckets.d90p !== a.buckets.d90p) return b.buckets.d90p - a.buckets.d90p;
    if (b.buckets.d90 !== a.buckets.d90) return b.buckets.d90 - a.buckets.d90;
    return b.total - a.total;
  });

  const totals: Record<Bucket, number> = {
    current: 0,
    d30: 0,
    d60: 0,
    d90: 0,
    d90p: 0,
  };
  for (const r of clientRows) {
    for (const k of Object.keys(totals) as Bucket[]) totals[k] += r.buckets[k];
  }

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

  return (
    <>
      <PageHeader
        title="AR Aging"
        meta={`As of ${today.toISOString().slice(0, 10)} · ${clientRows.length} clients with open invoices`}
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
          </>
        }
      />

      <div
        className="px-6 py-2 flex gap-2 flex-wrap items-end"
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
        <Card title="Aging by client">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Client</TH>
                <TH>Assigned to</TH>
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
                  <TD colSpan={8} style={{ color: "var(--ink-3)" }}>
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
                  <TR key={r.clientId} hover={false}>
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
                      />
                    </TD>
                  </TR>
                );
              })}
              <TR total hover={false}>
                <TD>Totals</TD>
                <TD>{""}</TD>
                {BUCKET_HEADERS.map((h) => (
                  <TD key={h.key} num>
                    <DrillNumber
                      value={totals[h.key]}
                      href={`/invoices?bucket=${h.key}`}
                      currencyCode={null}
                      compact
                    />
                  </TD>
                ))}
                <TD num>
                  <DrillNumber
                    value={totalReceivable}
                    href="/invoices"
                    currencyCode={null}
                    compact
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
                <TH num>Balance (USD)</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {flatRows.length === 0 && (
                <TR hover={false}>
                  <TD colSpan={9} style={{ color: "var(--ink-3)" }}>
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
                      {formatMoney(r.balanceDue, "USD", {
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
