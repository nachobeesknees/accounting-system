"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";
import {
  createAmortizationSchedule,
  generateAmortizationEntries,
} from "@/lib/mutations";
import { PermissionError, requirePermission } from "@/lib/permissions";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

function back(qs?: string): never {
  redirect(`/schedules${qs ? `?error=${encodeURIComponent(qs)}` : ""}`);
}

function backDetail(id: string, qs?: string): never {
  redirect(`/schedules/${id}${qs ? `?error=${encodeURIComponent(qs)}` : ""}`);
}

export async function createScheduleAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const kindRaw = String(formData.get("kind") ?? "prepaid");
  const kind = kindRaw === "fixed_asset" ? "fixed_asset" : "prepaid";
  const firmEntityRaw = String(formData.get("firmEntityId") ?? "").trim();
  try {
    requirePermission(user, "settings.write");
    await createAmortizationSchedule(user, {
      kind,
      name: String(formData.get("name") ?? ""),
      sourceAccountId: String(formData.get("sourceAccountId") ?? ""),
      targetAccountId: String(formData.get("targetAccountId") ?? ""),
      firmEntityId: firmEntityRaw || null,
      totalCost: parseFloat(String(formData.get("totalCost") ?? "0")),
      residualValue: parseFloat(String(formData.get("residualValue") ?? "0")),
      startDate: String(formData.get("startDate") ?? ""),
      months: parseInt(String(formData.get("months") ?? "0"), 10),
      notes: String(formData.get("notes") ?? ""),
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof PermissionError) {
      back("You don't have permission to create schedules.");
    }
    back(errorMessage(err));
  }
  revalidatePath("/schedules");
  back();
}

export async function generateEntriesAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const scheduleId = String(formData.get("scheduleId") ?? "");
  const throughDate = String(formData.get("throughDate") ?? "");
  try {
    requirePermission(user, "settings.write");
    if (!scheduleId) throw new Error("Missing schedule id.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(throughDate)) {
      throw new Error("Through-date must be YYYY-MM-DD.");
    }
    await generateAmortizationEntries(user, scheduleId, throughDate);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof PermissionError) {
      backDetail(scheduleId, "You don't have permission to generate entries.");
    }
    backDetail(scheduleId, errorMessage(err));
  }
  revalidatePath(`/schedules/${scheduleId}`);
  revalidatePath("/schedules");
  revalidatePath("/reports");
  backDetail(scheduleId);
}
