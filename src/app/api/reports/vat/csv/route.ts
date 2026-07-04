import { NextResponse, type NextRequest } from "next/server";

import { serializeCsv } from "@/lib/csv";
import { getBills, getInvoices, getTaxCodes } from "@/lib/data";
import { formatAmount } from "@/lib/money";
import { requirePermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import { buildVatReturn } from "@/lib/vat";
import { taxKindLabel } from "@/lib/tax";

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  try {
    requirePermission(user, "report.export_csv");
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const now = new Date();
  const from = url.searchParams.get("from") || `${now.getUTCFullYear()}-01-01`;
  const to = url.searchParams.get("to") || now.toISOString().slice(0, 10);
  const firmRaw = url.searchParams.get("firm") ?? "";
  const firmEntityId = firmRaw !== "" ? firmRaw : null;

  const [invoices, bills, taxCodes] = await Promise.all([
    getInvoices(),
    getBills(),
    getTaxCodes(),
  ]);
  const vat = buildVatReturn(invoices, bills, taxCodes, { from, to, firmEntityId });

  const headers = ["Section", "Code", "Name", "Treatment", "Net", "Tax", "Docs"];
  const rows: Array<Record<string, string>> = [];
  for (const r of vat.output) {
    rows.push({
      Section: "Output (sales)",
      Code: r.code,
      Name: r.name,
      Treatment: r.kind === "untaxed" ? "Untaxed" : taxKindLabel(r.kind),
      Net: formatAmount(r.net, { paren: true }),
      Tax: formatAmount(r.tax, { paren: true }),
      Docs: String(r.docIds.length),
    });
  }
  for (const r of vat.input) {
    rows.push({
      Section: "Input (bills)",
      Code: r.code,
      Name: r.name,
      Treatment: r.kind === "untaxed" ? "Untaxed" : taxKindLabel(r.kind),
      Net: formatAmount(r.net, { paren: true }),
      Tax: formatAmount(r.tax, { paren: true }),
      Docs: String(r.docIds.length),
    });
  }
  rows.push({
    Section: "Summary",
    Code: "",
    Name: "Output tax total",
    Treatment: "",
    Net: "",
    Tax: formatAmount(vat.outputTaxTotal, { paren: true }),
    Docs: "",
  });
  rows.push({
    Section: "Summary",
    Code: "",
    Name: "Input tax total",
    Treatment: "",
    Net: "",
    Tax: formatAmount(vat.inputTaxTotal, { paren: true }),
    Docs: "",
  });
  rows.push({
    Section: "Summary",
    Code: "",
    // With a firm filter, output is firm-scoped but input (bills) is all-firms,
    // so a net remittance figure would mix scopes — omit the amount and say so.
    Name:
      vat.netPayable == null
        ? "Net VAT (n/a — firm filter: input tax is all-firms)"
        : vat.netPayable >= 0
          ? "Net VAT payable"
          : "Net VAT refundable",
    Treatment: "",
    Net: "",
    Tax: vat.netPayable == null ? "" : formatAmount(Math.abs(vat.netPayable), { paren: true }),
    Docs: "",
  });
  rows.push({
    Section: "Non-net sales",
    Code: "",
    Name: "Zero-rated sales",
    Treatment: "zero_rated",
    Net: formatAmount(vat.zeroRatedSalesTotal, { paren: true }),
    Tax: "",
    Docs: "",
  });
  rows.push({
    Section: "Non-net sales",
    Code: "",
    Name: "Exempt sales",
    Treatment: "exempt",
    Net: formatAmount(vat.exemptSalesTotal, { paren: true }),
    Tax: "",
    Docs: "",
  });
  rows.push({
    Section: "Non-net sales",
    Code: "",
    Name: "Out-of-scope sales",
    Treatment: "out_of_scope",
    Net: formatAmount(vat.outOfScopeSalesTotal, { paren: true }),
    Tax: "",
    Docs: "",
  });

  const csv = serializeCsv(headers, rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vat-return-${from}_${to}.csv"`,
    },
  });
}
