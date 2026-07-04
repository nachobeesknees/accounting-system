"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createTaxCode, updateTaxCode } from "@/lib/mutations";
import { PermissionError, requirePermission } from "@/lib/permissions";
import type { TaxCodeKind } from "@/lib/types";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

const VALID_KINDS: readonly TaxCodeKind[] = [
  "standard",
  "reduced",
  "zero_rated",
  "exempt",
  "out_of_scope",
];

async function requireManage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    requirePermission(user, "tax.manage_codes");
  } catch (err) {
    if (err instanceof PermissionError) {
      redirect(
        "/settings/tax-codes?error=" +
          encodeURIComponent("You don't have permission to manage tax codes."),
      );
    }
    throw err;
  }
  return user;
}

/** Rate arrives as a percent string ("15"); stored as decimal (0.15). */
function parseRate(raw: string): number {
  const pct = parseFloat(raw.trim());
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return pct / 100;
}

export async function createTaxCodeAction(formData: FormData): Promise<void> {
  const user = await requireManage();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "standard");
  const kind = (VALID_KINDS.includes(kindRaw as TaxCodeKind)
    ? kindRaw
    : "standard") as TaxCodeKind;
  const rate = parseRate(String(formData.get("ratePct") ?? "0"));
  const country = String(formData.get("country") ?? "").trim();
  try {
    await createTaxCode(user, {
      code,
      name,
      rate,
      kind,
      country: country || null,
      isActive: true,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect("/settings/tax-codes?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/settings/tax-codes");
  redirect("/settings/tax-codes?saved=1");
}

export async function updateTaxCodeAction(formData: FormData): Promise<void> {
  const user = await requireManage();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "standard");
  const kind = (VALID_KINDS.includes(kindRaw as TaxCodeKind)
    ? kindRaw
    : "standard") as TaxCodeKind;
  const rate = parseRate(String(formData.get("ratePct") ?? "0"));
  const isActive = formData.get("isActive") === "on";
  try {
    await updateTaxCode(user, id, { name, kind, rate, isActive });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect("/settings/tax-codes?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/settings/tax-codes");
  redirect("/settings/tax-codes?saved=1");
}
