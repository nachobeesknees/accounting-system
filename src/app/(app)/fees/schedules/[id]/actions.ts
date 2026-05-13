"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { deleteFeeSchedule, updateFeeSchedule } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import type { EntityKind } from "@/lib/types";

const VALID_KINDS: EntityKind[] = [
  "llc",
  "trust",
  "scorp",
  "ccorp",
  "partnership",
  "foundation",
  "individual",
  "other",
];

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function updateScheduleAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/fees");

  const name = String(formData.get("name") ?? "").trim();
  const entityKindRaw = String(formData.get("entityKind") ?? "");
  const annualFee = parseAmount(String(formData.get("annualFee") ?? ""));
  const includedHours = parseAmount(String(formData.get("includedHours") ?? ""));
  const yearStr = String(formData.get("applicableYear") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const isActive = formData.get("isActive") === "on";

  try {
    await updateFeeSchedule(user, id, {
      name: name || undefined,
      entityKind: (VALID_KINDS as readonly string[]).includes(entityKindRaw)
        ? (entityKindRaw as EntityKind)
        : undefined,
      annualFee,
      includedHours,
      applicableYear: yearStr ? parseInt(yearStr, 10) : null,
      notes: notes || null,
      isActive,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect(`/fees/schedules/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/fees");
  redirect(`/fees/schedules/${id}?saved=1`);
}

export async function deleteScheduleAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/fees");
  try {
    await deleteFeeSchedule(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/fees");
  redirect("/fees?tab=schedules");
}
