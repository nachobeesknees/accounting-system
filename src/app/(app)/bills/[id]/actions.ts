"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";
import {
  approveBill,
  recordBillPayment,
  voidBill,
} from "@/lib/mutations";
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

function revalidateCommon(billId: string) {
  revalidatePath("/bills");
  revalidatePath(`/bills/${billId}`);
  revalidatePath("/");
  revalidatePath("/journal");
}

export async function approveBillAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const billId = String(formData.get("billId") ?? "");
  if (!billId) redirect("/bills");

  try {
    const result = await approveBill(user, billId);
    revalidateCommon(billId);
    redirect(`/bills/${billId}?approved=${encodeURIComponent(result.entryNumber)}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to approve bill.";
    redirect(`/bills/${billId}?error=${encodeURIComponent(msg)}`);
  }
}

export async function recordBillPaymentAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const billId = String(formData.get("billId") ?? "");
  if (!billId) redirect("/bills");

  const amountRaw = String(formData.get("amount") ?? "");
  const paymentDate = String(formData.get("paymentDate") ?? "");
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();

  const amount = parseAmount(amountRaw);

  if (!paymentDate) {
    redirect(
      `/bills/${billId}?error=${encodeURIComponent("Payment date is required.")}`,
    );
  }
  if (amount <= 0) {
    redirect(
      `/bills/${billId}?error=${encodeURIComponent("Payment amount must be > 0.")}`,
    );
  }

  try {
    const result = await recordBillPayment(user, {
      billId,
      amount,
      paymentDate,
      bankAccountId: bankAccountId === "" ? null : bankAccountId,
      reference: reference === "" ? null : reference,
    });
    revalidateCommon(billId);
    redirect(`/bills/${billId}?paid=${encodeURIComponent(result.entryNumber)}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to record payment.";
    redirect(`/bills/${billId}?error=${encodeURIComponent(msg)}`);
  }
}

export async function voidBillAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const billId = String(formData.get("billId") ?? "");
  if (!billId) redirect("/bills");

  const reason = String(formData.get("reason") ?? "").trim();

  try {
    await voidBill(user, billId, reason || "Voided from bill detail");
    revalidateCommon(billId);
    redirect(`/bills/${billId}?voided=1`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to void bill.";
    redirect(`/bills/${billId}?error=${encodeURIComponent(msg)}`);
  }
}
