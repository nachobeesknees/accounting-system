import { NextResponse } from "next/server";

import { findBillByVendorInvoiceNumber } from "@/lib/data";
import { getSessionUser } from "@/lib/session";

/**
 * GET /api/bills/check-duplicate?vendorId=...&number=...
 *
 * Returns whether another bill with the same (vendorId, vendor invoice
 * number) already exists, so the bill form can show a soft duplicate
 * warning. Auth-gated to the same session cookie the rest of the app
 * uses; never blocks bill creation — purely an informational check.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const vendorId = url.searchParams.get("vendorId")?.trim() ?? "";
  const number = url.searchParams.get("number")?.trim() ?? "";
  const excludeBillId =
    url.searchParams.get("excludeBillId")?.trim() || undefined;

  if (!vendorId || !number) {
    return NextResponse.json({ duplicate: false });
  }

  const match = await findBillByVendorInvoiceNumber(
    vendorId,
    number,
    excludeBillId,
  );
  if (!match) {
    return NextResponse.json({ duplicate: false });
  }
  return NextResponse.json({
    duplicate: true,
    billId: match.id,
    billNumber: match.billNumber,
  });
}
