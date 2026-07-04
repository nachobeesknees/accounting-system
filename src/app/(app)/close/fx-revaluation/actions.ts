"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";
import { bookFxRevaluation } from "@/lib/mutations";
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

function parseScope(raw: string): "all" | string | null {
  if (raw === "all") return "all";
  if (raw === "firm") return null;
  return raw;
}

function back(date: string, scope: string, qs?: string): never {
  const ps = new URLSearchParams({ date, scope });
  if (qs) ps.set("error", qs);
  redirect(`/close/fx-revaluation?${ps.toString()}`);
}

export async function bookFxRevaluationAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const date = String(formData.get("revaluationDate") ?? "");
  const scopeRaw = String(formData.get("scope") ?? "all");
  try {
    requirePermission(user, "fx.revalue");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Revaluation date must be YYYY-MM-DD.");
    }
    await bookFxRevaluation(user, date, parseScope(scopeRaw));
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof PermissionError) {
      back(date, scopeRaw, "You don't have permission to book a revaluation.");
    }
    back(date, scopeRaw, errorMessage(err));
  }
  revalidatePath("/close/fx-revaluation");
  revalidatePath("/reports");
  back(date, scopeRaw);
}
