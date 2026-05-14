"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";
import {
  approveBill,
  recordBillPayment,
  setBillChargeback,
  voidBill,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

type ChargebackType = "cost" | "markup" | "fixed" | "included";
function parseChargebackType(raw: string): ChargebackType | null {
  if (raw === "cost" || raw === "markup" || raw === "fixed" || raw === "included") {
    return raw;
  }
  return null;
}

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

export async function setBillChargebackAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const billId = String(formData.get("billId") ?? "");
  if (!billId) redirect("/bills");

  const intent = String(formData.get("intent") ?? "save");

  try {
    if (intent === "clear") {
      await setBillChargeback(user, { billId, type: null });
      revalidateCommon(billId);
      redirect(`/bills/${billId}?cb=cleared`);
    }

    const recipient = String(formData.get("chargebackRecipient") ?? "none");
    const typeRaw = String(formData.get("chargebackType") ?? "");
    const type = parseChargebackType(typeRaw);
    const clientId = String(formData.get("chargebackClientId") ?? "").trim();
    const entityId = String(formData.get("chargebackEntityId") ?? "").trim();
    const markupPctRaw = String(formData.get("markupPct") ?? "").trim();
    const rebillAmountRaw = String(formData.get("rebillAmount") ?? "").trim();
    const notes = String(formData.get("chargebackNotes") ?? "").trim();

    if (recipient === "none" || !type) {
      await setBillChargeback(user, { billId, type: null });
      revalidateCommon(billId);
      redirect(`/bills/${billId}?cb=cleared`);
    }

    if (recipient === "client" && !clientId) {
      redirect(
        `/bills/${billId}?error=${encodeURIComponent("Pick a client to rebill to.")}`,
      );
    }
    if (recipient === "entity" && !entityId) {
      redirect(
        `/bills/${billId}?error=${encodeURIComponent("Pick an entity to rebill to.")}`,
      );
    }

    let markupPct: number | null = null;
    let rebillAmount: number | null = null;
    if (type === "markup") {
      const pct = parseAmount(markupPctRaw);
      if (!Number.isFinite(pct) || pct < 0) {
        redirect(
          `/bills/${billId}?error=${encodeURIComponent("Markup % must be a positive number.")}`,
        );
      }
      // Input is a percent (15) — store as decimal (0.15).
      markupPct = pct / 100;
    }
    if (type === "fixed") {
      const amt = parseAmount(rebillAmountRaw);
      if (!Number.isFinite(amt) || amt <= 0) {
        redirect(
          `/bills/${billId}?error=${encodeURIComponent("Fixed rebill amount must be > 0.")}`,
        );
      }
      rebillAmount = amt;
    }

    await setBillChargeback(user, {
      billId,
      type,
      clientId: recipient === "client" ? clientId : null,
      entityId: recipient === "entity" ? entityId : null,
      markupPct,
      rebillAmount,
      notes: notes === "" ? null : notes,
    });
    revalidateCommon(billId);
    redirect(`/bills/${billId}?cb=saved`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to update chargeback.";
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
