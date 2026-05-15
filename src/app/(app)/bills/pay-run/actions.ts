"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { recordBillPayment } from "@/lib/mutations";
import { getSessionUser } from "@/lib/session";
import {
  PermissionError,
  requirePermission,
  type Action,
} from "@/lib/permissions";
import { parseAmount } from "@/lib/money";

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Pay all selected bills in full at their current balance due.
 *
 * Each bill goes through the existing `recordBillPayment` mutation, which
 * writes a JE (Cash credit / AP debit) and updates the bill's status.
 *
 * We pay each bill in its native currency from the chosen bank account.
 * For the MVP we don't FX-convert; if a bill is in a non-USD currency the
 * caller is responsible for picking a matching bank account.
 */
export async function runPaymentsAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // `bill.approve` is the closest existing permission for paying — admins
  // and managers carry it; viewers / employees / accountants do not.
  const action: Action = "bill.approve";
  try {
    requirePermission(user, action);
  } catch (err) {
    if (err instanceof PermissionError) {
      redirect(
        `/bills/pay-run?error=${encodeURIComponent(
          "You don't have permission to pay bills.",
        )}`,
      );
    }
    throw err;
  }

  const billIds = formData
    .getAll("billIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const paymentDate = String(formData.get("paymentDate") ?? "").trim();
  const bankAccountIdRaw = String(formData.get("bankAccountId") ?? "").trim();
  const bankAccountId = bankAccountIdRaw === "" ? null : bankAccountIdRaw;

  if (billIds.length === 0) {
    redirect(
      `/bills/pay-run?error=${encodeURIComponent("Pick at least one bill to pay.")}`,
    );
  }
  if (!paymentDate) {
    redirect(
      `/bills/pay-run?error=${encodeURIComponent("Payment date is required.")}`,
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.bills)
    .where(inArray(schema.bills.id, billIds));

  let paid = 0;
  try {
    for (const b of rows) {
      const balance = parseAmount(b.balanceDue);
      if (balance <= 0) continue;
      if (b.status === "draft" || b.status === "void" || b.status === "paid") {
        continue;
      }
      await recordBillPayment(user, {
        billId: b.id,
        amount: balance,
        paymentDate,
        bankAccountId,
      });
      paid += 1;
    }
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg =
      err instanceof Error ? err.message : "Failed to record payments.";
    redirect(`/bills/pay-run?error=${encodeURIComponent(msg)}&paid=${paid}`);
  }

  revalidatePath("/bills");
  revalidatePath("/bills/pay-run");
  revalidatePath("/cash-forecast");
  revalidatePath("/");
  redirect(`/bills/pay-run?paid=${paid}`);
}
