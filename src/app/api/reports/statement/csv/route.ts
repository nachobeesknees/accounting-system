import { NextResponse, type NextRequest } from "next/server";

import { serializeCsv } from "@/lib/csv";
import {
  getCustomerById,
  getFundsOnAccount,
  getInvoices,
} from "@/lib/data";
import { formatAmount } from "@/lib/money";
import { requirePermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import { buildStatement } from "@/lib/statement";

const BUCKET_LABEL: Record<string, string> = {
  current: "Current",
  d30: "1-30",
  d60: "31-60",
  d90: "61-90",
  d90p: "90+",
};

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  try {
    requirePermission(user, "report.export_csv");
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const asOf = url.searchParams.get("asOf") || new Date().toISOString().slice(0, 10);
  if (!id) return new NextResponse("Missing client id", { status: 400 });

  const customer = await getCustomerById(id);
  if (!customer) return new NextResponse("Client not found", { status: 404 });

  const [invoices, funds] = await Promise.all([
    getInvoices(),
    getFundsOnAccount(id),
  ]);
  const stmt = buildStatement(invoices, id, asOf, funds);

  const headers = [
    "Invoice",
    "Type",
    "Date",
    "Due",
    "Age (days)",
    "Bucket",
    "Balance",
    "Currency",
  ];
  const rows: Array<Record<string, string>> = stmt.lines.map((l) => ({
    Invoice: l.invoiceNumber,
    Type: l.kind === "credit_memo" ? "Credit memo" : "Invoice",
    Date: l.invoiceDate,
    Due: l.dueDate,
    "Age (days)": l.ageDays <= 0 ? "0" : String(l.ageDays),
    Bucket: BUCKET_LABEL[l.bucket],
    Balance: formatAmount(l.balance, { paren: true }),
    Currency: l.currencyCode,
  }));
  rows.push({
    Invoice: "",
    Type: "",
    Date: "",
    Due: "",
    "Age (days)": "",
    Bucket: "Funds on account",
    Balance: formatAmount(-stmt.fundsOnAccount, { paren: true }),
    Currency: "",
  });
  rows.push({
    Invoice: "",
    Type: "",
    Date: "",
    Due: "",
    "Age (days)": "",
    Bucket: "Closing balance",
    Balance: formatAmount(stmt.closingBalance, { paren: true }),
    Currency: "",
  });

  const csv = serializeCsv(headers, rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${customer.code}-${asOf}.csv"`,
    },
  });
}
