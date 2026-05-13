"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createEmployeeRate, deleteEmployeeRate } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function createRateAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "").trim();
  const billableRate = parseAmount(String(formData.get("billableRate") ?? ""));
  const costRateRaw = String(formData.get("costRate") ?? "").trim();
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  const isDefault = formData.get("isDefault") === "on";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!userId || !role || !effectiveDate) {
    redirect("/time/rates?error=" + encodeURIComponent("User, role and effective date are required."));
  }

  try {
    await createEmployeeRate(user, {
      userId,
      role,
      billableRate,
      costRate: costRateRaw === "" ? null : parseAmount(costRateRaw),
      effectiveDate,
      isDefault,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect("/time/rates?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/time/rates");
  redirect("/time/rates?saved=1");
}

export async function deleteRateAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/time/rates");
  try {
    await deleteEmployeeRate(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/time/rates");
  redirect("/time/rates");
}
