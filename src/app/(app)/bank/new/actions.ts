"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createBankAccount } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

export type CreateBankState = { error: string | null };

export async function createBankAccountAction(
  _prev: CreateBankState,
  formData: FormData,
): Promise<CreateBankState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const institution = String(formData.get("institution") ?? "").trim();
  const lastFour = String(formData.get("lastFour") ?? "").trim();
  const currencyCode = String(formData.get("currencyCode") ?? "USD").trim();
  const entityId = String(formData.get("entityId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const balanceRaw = String(formData.get("currentBalance") ?? "").trim();
  const balanceAsOf = String(formData.get("balanceAsOf") ?? "").trim();
  const ownershipRaw = String(formData.get("ownershipPercent") ?? "").trim();
  const ownershipPercent =
    ownershipRaw === ""
      ? null
      : Math.max(0, Math.min(100, parseFloat(ownershipRaw)));

  if (!name) return { error: "Name is required." };
  if (!accountId) return { error: "GL account is required." };

  try {
    const created = await createBankAccount(user, {
      name,
      accountId,
      institution: institution || null,
      lastFour: lastFour || null,
      currencyCode: currencyCode || "USD",
      entityId: entityId || null,
      clientId: clientId || null,
      currentBalance: balanceRaw ? parseAmount(balanceRaw) : null,
      balanceAsOf: balanceAsOf || null,
      ownershipPercent,
    });
    revalidatePath("/bank");
    redirect(`/bank/${created.id}`);
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
    return { error: err instanceof Error ? err.message : "Failed to create account." };
  }
}
