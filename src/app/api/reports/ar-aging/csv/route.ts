import { NextResponse, type NextRequest } from "next/server";

import { serializeCsv } from "@/lib/csv";
import {
  getAllCustomerAssignments,
  getBaseCurrency,
  getCustomers,
  getEntities,
  getInvoices,
} from "@/lib/data";
import { formatAmount, parseAmount } from "@/lib/money";
import { requirePermission } from "@/lib/permissions";
import {
  getAccessScope,
  isScopedRecordAllowed,
} from "@/lib/record-access";
import { getSessionUser } from "@/lib/session";

type Bucket = "current" | "d30" | "d60" | "d90" | "d90p";

function bucketFor(daysOverdue: number): Bucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  if (daysOverdue <= 90) return "d90";
  return "d90p";
}

const BUCKET_LABEL: Record<Bucket, string> = {
  current: "Current",
  d30: "1-30",
  d60: "31-60",
  d90: "61-90",
  d90p: "90+",
};

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    requirePermission(user, "report.export_csv");
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const accessScope = await getAccessScope(user);

  const url = new URL(req.url);
  const idsRaw = url.searchParams.get("ids") ?? "";
  const idFilter = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const idSet = new Set(idFilter);
  // Same View / Employee filters the AR aging page applies — the button
  // forwards the page's search params so the export matches the screen.
  const view = url.searchParams.get("view") === "mine" ? "mine" : "all";
  const employeeFilter = url.searchParams.get("employee") ?? "";

  const [invoices, customers, entities, base, allAssignments] =
    await Promise.all([
      getInvoices(),
      getCustomers(),
      getEntities(),
      getBaseCurrency(),
      getAllCustomerAssignments(),
    ]);

  // Mirror the page: "mine" narrows to the session user's assigned
  // customers; the employee dropdown narrows to that employee's customers.
  const customersByUser = new Map<string, Set<string>>();
  for (const a of allAssignments) {
    if (!customersByUser.has(a.userId)) customersByUser.set(a.userId, new Set());
    customersByUser.get(a.userId)!.add(a.customerId);
  }
  const effectiveEmployeeId =
    employeeFilter !== ""
      ? employeeFilter
      : view === "mine"
        ? user.userId
        : null;
  const allowedCustomerIds = effectiveEmployeeId
    ? customersByUser.get(effectiveEmployeeId) ?? new Set<string>()
    : null;
  const baseCode = base?.code ?? "USD";
  const customersById = new Map(customers.map((c) => [c.id, c] as const));
  const entitiesById = new Map(entities.map((e) => [e.id, e] as const));
  const visibleInvoices = invoices.filter((inv) =>
    isScopedRecordAllowed(accessScope, {
      clientId: inv.clientId,
      customerId: inv.customerId,
      entityId: inv.entityId,
    }),
  );

  const today = new Date();

  const rows: Array<Record<string, string>> = [];
  for (const inv of visibleInvoices) {
    if (idSet.size > 0 && !idSet.has(inv.id)) continue;
    if (allowedCustomerIds && !allowedCustomerIds.has(inv.customerId)) continue;
    const balance = parseAmount(inv.balanceDue);
    if (balance <= 0) continue;
    if (inv.status === "void" || inv.status === "paid") continue;

    const due = new Date(`${inv.dueDate}T00:00:00Z`);
    const daysOverdue = Math.floor(
      (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
    );
    const bucket = bucketFor(daysOverdue);
    const client = customersById.get(inv.customerId);
    const entity = inv.entityId ? entitiesById.get(inv.entityId) : null;
    // Base equivalent via the invoice's FX snapshot:
    // base = native / fxRate; NULL fxRate = already base currency.
    const fx = inv.fxRate == null ? null : parseAmount(inv.fxRate);
    const balanceBase = fx != null && fx > 0 ? balance / fx : balance;

    rows.push({
      "Invoice #": inv.invoiceNumber,
      Client: client?.name ?? "",
      Entity: entity?.name ?? "",
      "Invoice date": inv.invoiceDate,
      "Due date": inv.dueDate,
      "Days overdue": daysOverdue <= 0 ? "0" : String(daysOverdue),
      Bucket: BUCKET_LABEL[bucket],
      Amount: formatAmount(balance, { paren: true }),
      Currency: inv.currencyCode,
      [`Amount (${baseCode})`]: formatAmount(balanceBase, { paren: true }),
      Status: inv.status,
    });
  }

  const headers = [
    "Invoice #",
    "Client",
    "Entity",
    "Invoice date",
    "Due date",
    "Days overdue",
    "Bucket",
    "Amount",
    "Currency",
    `Amount (${baseCode})`,
    "Status",
  ];
  const csv = serializeCsv(headers, rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ar-aging-${today.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
