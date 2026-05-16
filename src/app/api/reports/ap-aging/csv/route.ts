import { NextResponse, type NextRequest } from "next/server";

import { serializeCsv } from "@/lib/csv";
import {
  getBankAccounts,
  getBills,
  getCustomers,
  getEntities,
  getVendors,
} from "@/lib/data";
import { formatAmount, parseAmount } from "@/lib/money";
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

  const url = new URL(req.url);
  const idsRaw = url.searchParams.get("ids") ?? "";
  const idFilter = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const idSet = new Set(idFilter);

  const [bills, vendors, customers, entities, bankAccounts] =
    await Promise.all([
      getBills(),
      getVendors(),
      getCustomers(),
      getEntities(),
      getBankAccounts(),
    ]);
  const vendorsById = new Map(vendors.map((v) => [v.id, v] as const));
  const customersById = new Map(customers.map((c) => [c.id, c] as const));
  const entitiesById = new Map(entities.map((e) => [e.id, e] as const));
  const activeBanks = bankAccounts.filter((b) => b.isActive);
  const bankByEntity = new Map(
    activeBanks
      .filter((b) => b.entityId)
      .map((b) => [b.entityId as string, b] as const),
  );
  const bankByClient = new Map(
    activeBanks
      .filter((b) => b.clientId && !b.entityId)
      .map((b) => [b.clientId as string, b] as const),
  );
  const fallbackBank = activeBanks.find((b) => !b.entityId && !b.clientId)
    ?? activeBanks[0];
  function pickBank(bill: {
    entityId?: string | null;
    clientId?: string | null;
  }) {
    if (bill.entityId && bankByEntity.has(bill.entityId)) {
      return bankByEntity.get(bill.entityId);
    }
    if (bill.clientId && bankByClient.has(bill.clientId)) {
      return bankByClient.get(bill.clientId);
    }
    return fallbackBank;
  }

  const today = new Date();

  const rows: Array<Record<string, string>> = [];
  for (const bill of bills) {
    if (idSet.size > 0 && !idSet.has(bill.id)) continue;
    const balance = parseAmount(bill.balanceDue);
    if (balance <= 0) continue;
    if (bill.status === "void" || bill.status === "paid") continue;

    const due = new Date(`${bill.dueDate}T00:00:00Z`);
    const daysOverdue = Math.floor(
      (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
    );
    const bucket = bucketFor(daysOverdue);
    const vendor = vendorsById.get(bill.vendorId);
    const client = bill.clientId ? customersById.get(bill.clientId) : null;
    const entity = bill.entityId ? entitiesById.get(bill.entityId) : null;
    const bank = pickBank(bill);

    rows.push({
      "Bill #": bill.billNumber,
      Vendor: vendor?.name ?? "",
      "Vendor code": vendor?.code ?? "",
      Client: client?.name ?? "",
      Entity: entity?.name ?? "",
      "Bill date": bill.billDate,
      "Due date": bill.dueDate,
      "Days overdue": daysOverdue <= 0 ? "0" : String(daysOverdue),
      Bucket: BUCKET_LABEL[bucket],
      Amount: formatAmount(balance, { paren: true }),
      Currency: bill.currencyCode,
      "Bank account": bank?.name ?? "",
      Status: bill.status,
    });
  }

  const headers = [
    "Bill #",
    "Vendor",
    "Vendor code",
    "Client",
    "Entity",
    "Bill date",
    "Due date",
    "Days overdue",
    "Bucket",
    "Amount",
    "Currency",
    "Bank account",
    "Status",
  ];
  const csv = serializeCsv(headers, rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ap-aging-${today.toISOString().slice(0, 10)}.csv"`,
    },
  });
}
