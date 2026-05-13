"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { deleteEntityFee, updateEntityFee } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import type { EntityFeeStatus } from "@/lib/types";

const VALID_STATUSES: EntityFeeStatus[] = ["draft", "active", "billed", "paid", "void"];

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function updateAssignmentAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/fees");

  const entityId = String(formData.get("entityId") ?? "").trim();
  const billingYearStr = String(formData.get("billingYear") ?? "").trim();
  const feeScheduleId = String(formData.get("feeScheduleId") ?? "").trim();
  const annualFee = parseAmount(String(formData.get("annualFee") ?? ""));
  const includedHours = parseAmount(String(formData.get("includedHours") ?? ""));
  const statusRaw = String(formData.get("status") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    await updateEntityFee(user, id, {
      entityId: entityId || undefined,
      billingYear: billingYearStr ? parseInt(billingYearStr, 10) : undefined,
      feeScheduleId: feeScheduleId || null,
      annualFee,
      includedHours,
      status: (VALID_STATUSES as readonly string[]).includes(statusRaw)
        ? (statusRaw as EntityFeeStatus)
        : undefined,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect(`/fees/assignments/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/fees");
  redirect(`/fees/assignments/${id}?saved=1`);
}

export async function deleteAssignmentAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/fees");
  try {
    await deleteEntityFee(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/fees");
  redirect("/fees?tab=assignments");
}
