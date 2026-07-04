"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";
import { closeYearEnd, reopenYearEnd } from "@/lib/mutations";
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

/** Map the form scope value into the mutation's "all" | officeId | null. */
function parseScope(raw: string): "all" | string | null {
  if (raw === "all") return "all";
  if (raw === "firm") return null;
  return raw;
}

function back(year: string, scope: string, qs?: string): never {
  const ps = new URLSearchParams({ year, scope });
  if (qs) ps.set("error", qs);
  redirect(`/close/year-end?${ps.toString()}`);
}

export async function closeYearAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const yearRaw = String(formData.get("fiscalYear") ?? "");
  const scopeRaw = String(formData.get("scope") ?? "all");
  const year = parseInt(yearRaw, 10);
  try {
    requirePermission(user, "close.year_end");
    if (!Number.isInteger(year)) throw new Error("Invalid fiscal year.");
    await closeYearEnd(user, year, parseScope(scopeRaw));
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof PermissionError) {
      back(yearRaw, scopeRaw, "You don't have permission to close the year.");
    }
    back(yearRaw, scopeRaw, errorMessage(err));
  }
  revalidatePath("/close/year-end");
  revalidatePath("/reports");
  revalidatePath("/");
  back(yearRaw, scopeRaw);
}

export async function reopenYearAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const closeId = String(formData.get("closeId") ?? "");
  const yearRaw = String(formData.get("fiscalYear") ?? "");
  const scopeRaw = String(formData.get("scope") ?? "all");
  try {
    requirePermission(user, "close.year_end");
    if (!closeId) throw new Error("Missing close id.");
    await reopenYearEnd(user, closeId);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof PermissionError) {
      back(yearRaw, scopeRaw, "You don't have permission to reopen the year.");
    }
    back(yearRaw, scopeRaw, errorMessage(err));
  }
  revalidatePath("/close/year-end");
  revalidatePath("/reports");
  revalidatePath("/");
  back(yearRaw, scopeRaw);
}
