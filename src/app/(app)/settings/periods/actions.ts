"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";
import {
  closePeriod,
  ensureAccountingPeriods,
  lockPeriod,
  reopenPeriod,
} from "@/lib/periods";

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
  redirect(`/settings/periods${qs ? `?${qs}` : ""}`);
}

async function ensureAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function seedPeriodsAction(_formData: FormData): Promise<void> {
  await ensureAdmin();
  const year = new Date().getUTCFullYear();
  await ensureAccountingPeriods(year);
  revalidatePath("/settings/periods");
  back();
}

export async function closePeriodAction(formData: FormData): Promise<void> {
  const user = await ensureAdmin();
  const periodId = String(formData.get("periodId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!periodId) back();
  try {
    await closePeriod(user, periodId, notes === "" ? null : notes);
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(`error=${encodeURIComponent(errorMessage(err))}`);
  }
  revalidatePath("/settings/periods");
  revalidatePath("/");
  back();
}

export async function lockPeriodAction(formData: FormData): Promise<void> {
  const user = await ensureAdmin();
  const periodId = String(formData.get("periodId") ?? "");
  if (!periodId) back();
  try {
    await lockPeriod(user, periodId);
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(`error=${encodeURIComponent(errorMessage(err))}`);
  }
  revalidatePath("/settings/periods");
  revalidatePath("/");
  back();
}

export async function reopenPeriodAction(formData: FormData): Promise<void> {
  const user = await ensureAdmin();
  const periodId = String(formData.get("periodId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!periodId) back();
  try {
    await reopenPeriod(user, periodId, reason);
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(`error=${encodeURIComponent(errorMessage(err))}`);
  }
  revalidatePath("/settings/periods");
  revalidatePath("/");
  back();
}
