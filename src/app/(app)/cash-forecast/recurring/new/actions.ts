"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createRecurringPayment } from "@/lib/mutations";
import type { CreateRecurringPaymentInput } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import { getSessionUser } from "@/lib/session";

export type CreateRecurringState = { error?: string };

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

export async function createRecurringAction(
  _prev: CreateRecurringState,
  formData: FormData,
): Promise<CreateRecurringState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "");
  const frequencyRaw = String(formData.get("frequency") ?? "");
  const nextPaymentDate = String(formData.get("nextPaymentDate") ?? "");
  const expenseAccountId = String(formData.get("expenseAccountId") ?? "");
  const vendorId = String(formData.get("vendorId") ?? "").trim();
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "Name is required." };
  const amount = parseAmount(amountRaw);
  if (!(amount > 0)) return { error: "Amount must be greater than 0." };
  const frequency = parseFrequency(frequencyRaw);
  if (!frequency) return { error: "Frequency is required." };
  if (!nextPaymentDate) return { error: "Next payment date is required." };
  if (!expenseAccountId) return { error: "Expense account is required." };

  const input: CreateRecurringPaymentInput = {
    name,
    amount,
    frequency,
    nextPaymentDate,
    expenseAccountId,
    vendorId: vendorId === "" ? null : vendorId,
    bankAccountId: bankAccountId === "" ? null : bankAccountId,
    notes: notes === "" ? null : notes,
  };

  try {
    await createRecurringPayment(user, input);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error: err instanceof Error ? err.message : "Save failed",
    };
  }

  revalidatePath("/cash-forecast");
  revalidatePath("/cash-forecast/recurring");
  redirect("/cash-forecast/recurring?created=1");
}
