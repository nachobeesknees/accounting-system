import { NextResponse } from "next/server";

import { serializeCsv } from "@/lib/csv";
import {
  getBankAccountById,
  getBills,
  getPaymentRunById,
  getPaymentRunItemsByRunId,
  getVendors,
} from "@/lib/data";
import { hasPermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

/**
 * Payment file for a run — the CSV handed to the bank (or signers) to
 * execute the batch. One row per item: payment date, vendor, vendor bank
 * details when we have them on file, amount, currency, and a reference of
 * "run number + bill number" so the bank statement lines trace back here.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPermission(user, "report.export_csv")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const run = await getPaymentRunById(id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Dual control: the bank-executable payment file only exists once a
  // second user has released the run — otherwise the preparer could send
  // the batch to the bank without any release step.
  if (run.status !== "released") {
    return NextResponse.json(
      { error: "payment file is available only after the run is released" },
      { status: 409 },
    );
  }

  const [items, bills, vendors, bank] = await Promise.all([
    getPaymentRunItemsByRunId(run.id),
    getBills(),
    getVendors(),
    getBankAccountById(run.bankAccountId),
  ]);
  const billsById = new Map(bills.map((b) => [b.id, b] as const));
  const vendorsById = new Map(vendors.map((v) => [v.id, v] as const));

  // Only released runs reach this point, so the release date is the
  // payment date (defensive fallback to today if it's somehow missing).
  const paymentDate = run.releasedAt
    ? run.releasedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const currency = bank?.currencyCode ?? "USD";

  const headers = [
    "payment_date",
    "vendor_name",
    "vendor_bank_details",
    "amount",
    "currency",
    "reference",
  ];
  const rows = items
    .filter((i) => i.status !== "skipped")
    .map((i) => {
      const bill = billsById.get(i.billId);
      const vendor = bill ? vendorsById.get(bill.vendorId) : undefined;
      return {
        payment_date: paymentDate,
        vendor_name: vendor?.name ?? "",
        // Vendors don't carry bank/IBAN fields yet — emitted blank so the
        // file layout is stable once they do.
        vendor_bank_details: "",
        amount: i.amount,
        currency,
        reference: `${run.runNumber} ${bill?.billNumber ?? i.billId}`,
      };
    });

  const body = serializeCsv(headers, rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payment-file-${run.runNumber}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
