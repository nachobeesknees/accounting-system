"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseAmount } from "@/lib/money";
import { updateEntityFeeBilling } from "@/lib/mutations";
import { getSessionUser } from "@/lib/session";

type Frequency = "monthly" | "quarterly" | "semiannual" | "annual" | "one_time";
type FeeStatus = "draft" | "active" | "billed" | "paid" | "void";

const FREQUENCIES: readonly Frequency[] = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "one_time",
];

const FEE_STATUSES: readonly FeeStatus[] = [
  "draft",
  "active",
  "billed",
  "paid",
  "void",
];

function parseIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function saveFeeAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/fees");

  const frequencyRaw = String(formData.get("frequency") ?? "annual");
  const frequency: Frequency = (FREQUENCIES as readonly string[]).includes(
    frequencyRaw,
  )
    ? (frequencyRaw as Frequency)
    : "annual";

  const statusRaw = String(formData.get("status") ?? "draft");
  const status: FeeStatus = (FEE_STATUSES as readonly string[]).includes(
    statusRaw,
  )
    ? (statusRaw as FeeStatus)
    : "draft";

  const annualFeeRaw = String(formData.get("annualFee") ?? "").trim();
  const annualFee = annualFeeRaw ? parseAmount(annualFeeRaw) : undefined;

  const perPeriodRaw = String(formData.get("perPeriodAmount") ?? "").trim();
  const perPeriodAmount: number | null =
    perPeriodRaw === "" ? null : parseAmount(perPeriodRaw);

  const includedHoursRaw = String(formData.get("includedHours") ?? "").trim();
  const includedHours = includedHoursRaw
    ? parseAmount(includedHoursRaw)
    : undefined;

  const startDate = emptyToNull(String(formData.get("startDate") ?? ""));
  const endDate = emptyToNull(String(formData.get("endDate") ?? ""));
  const nextBillingDate = emptyToNull(
    String(formData.get("nextBillingDate") ?? ""),
  );

  const billingMonth = parseIntOrNull(String(formData.get("billingMonth") ?? ""));
  const billingDay = parseIntOrNull(String(formData.get("billingDay") ?? ""));

  const notes = emptyToNull(String(formData.get("notes") ?? ""));

  try {
    await updateEntityFeeBilling(user, id, {
      frequency,
      startDate,
      endDate,
      billingMonth,
      billingDay,
      nextBillingDate,
      perPeriodAmount,
      ...(annualFee !== undefined ? { annualFee } : {}),
      ...(includedHours !== undefined ? { includedHours } : {}),
      status,
      notes,
    });
  } catch (err: unknown) {
    redirect(
      `/fees/assignments/${id}/edit?error=${encodeURIComponent(
        err instanceof Error ? err.message : "Save failed",
      )}`,
    );
  }

  revalidatePath(`/fees/assignments/${id}`);
  revalidatePath("/fees");
  revalidatePath("/cash-forecast");
  redirect(`/fees/assignments/${id}?saved=1`);
}
