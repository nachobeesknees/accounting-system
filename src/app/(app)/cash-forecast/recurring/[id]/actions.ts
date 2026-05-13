"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteRecurringPayment,
  updateRecurringPayment,
  type UpdateRecurringPaymentInput,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import { getSessionUser } from "@/lib/session";

export type UpdateRecurringState = { error?: string };

const FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;
type Frequency = (typeof FREQUENCIES)[number];

function parseFrequency(raw: string): Frequency | null {
  return (FREQUENCIES as readonly string[]).includes(raw)
    ? (raw as Frequency)
    : null;
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

export async function updateRecurringAction(
  _prev: UpdateRecurringState,
  formData: FormData,
): Promise<UpdateRecurringState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing recurring payment id." };

  const action = String(formData.get("action") ?? "save");

  if (action === "deactivate") {
    try {
      await updateRecurringPayment(user, id, { isActive: false });
    } catch (err) {
      if (isRedirectError(err)) throw err;
      return {
        error: err instanceof Error ? err.message : "Failed to deactivate.",
      };
    }
    revalidatePath("/cash-forecast");
    revalidatePath("/cash-forecast/recurring");
    revalidatePath(`/cash-forecast/recurring/${id}`);
    redirect(`/cash-forecast/recurring/${id}?updated=1`);
  }

  const name = String(formData.get("name") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "");
  const frequencyRaw = String(formData.get("frequency") ?? "");
  const nextPaymentDate = String(formData.get("nextPaymentDate") ?? "");
  const expenseAccountId = String(formData.get("expenseAccountId") ?? "");
  const vendorId = String(formData.get("vendorId") ?? "").trim();
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const isActive = formData.get("isActive") != null;

  if (!name) return { error: "Name is required." };
  const amount = parseAmount(amountRaw);
  if (!(amount > 0)) return { error: "Amount must be greater than 0." };
  const frequency = parseFrequency(frequencyRaw);
  if (!frequency) return { error: "Frequency is required." };
  if (!nextPaymentDate) return { error: "Next payment date is required." };
  if (!expenseAccountId) return { error: "Expense account is required." };

  const patch: UpdateRecurringPaymentInput = {
    name,
    amount,
    frequency,
    nextPaymentDate,
    expenseAccountId,
    vendorId: vendorId === "" ? null : vendorId,
    bankAccountId: bankAccountId === "" ? null : bankAccountId,
    notes: notes === "" ? null : notes,
    isActive,
  };

  try {
    await updateRecurringPayment(user, id, patch);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error: err instanceof Error ? err.message : "Save failed",
    };
  }

  revalidatePath("/cash-forecast");
  revalidatePath("/cash-forecast/recurring");
  revalidatePath(`/cash-forecast/recurring/${id}`);
  redirect(`/cash-forecast/recurring/${id}?updated=1`);
}

export async function deleteRecurringAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) {
    redirect(
      `/cash-forecast/recurring?error=${encodeURIComponent("Missing recurring payment id.")}`,
    );
  }

  try {
    await deleteRecurringPayment(user, id);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Delete failed";
    redirect(
      `/cash-forecast/recurring/${id}?error=${encodeURIComponent(message)}`,
    );
  }

  revalidatePath("/cash-forecast");
  revalidatePath("/cash-forecast/recurring");
  redirect("/cash-forecast/recurring?deleted=1");
}
