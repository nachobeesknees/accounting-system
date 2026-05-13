"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createEntityFee } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import type { EntityFeeStatus } from "@/lib/types";

const VALID_STATUSES: EntityFeeStatus[] = ["draft", "active", "billed", "paid", "void"];

export type CreateAssignmentState = { error: string | null };

export async function createAssignmentAction(
  _prev: CreateAssignmentState,
  formData: FormData,
): Promise<CreateAssignmentState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const entityId = String(formData.get("entityId") ?? "");
  const billingYear = parseInt(String(formData.get("billingYear") ?? ""), 10);
  const feeScheduleId = String(formData.get("feeScheduleId") ?? "");
  const annualFee = parseAmount(String(formData.get("annualFee") ?? ""));
  const includedHours = parseAmount(String(formData.get("includedHours") ?? ""));
  const statusRaw = String(formData.get("status") ?? "draft");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!entityId) return { error: "Entity is required." };
  if (!Number.isFinite(billingYear)) return { error: "Billing year is required." };
  if (annualFee < 0) return { error: "Annual fee must be ≥ 0." };
  if (includedHours < 0) return { error: "Included hours must be ≥ 0." };

  try {
    await createEntityFee(user, {
      entityId,
      billingYear,
      feeScheduleId: feeScheduleId || null,
      annualFee,
      includedHours,
      status: (VALID_STATUSES as readonly string[]).includes(statusRaw)
        ? (statusRaw as EntityFeeStatus)
        : "draft",
      notes: notes || null,
    });
    revalidatePath("/fees");
    redirect("/fees?tab=assignments");
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "Failed to create assignment." };
  }
}
