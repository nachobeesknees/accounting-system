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
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const routingNumber = String(formData.get("routingNumber") ?? "").trim();
  const accountType = String(formData.get("accountType") ?? "").trim();
  const swiftBic = String(formData.get("swiftBic") ?? "").trim();
  const iban = String(formData.get("iban") ?? "").trim();
  const bankAddress = String(formData.get("bankAddress") ?? "").trim();
  const bankCountry = String(formData.get("bankCountry") ?? "").trim().toUpperCase();
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
  if (!accountId && !entityId && !clientId) {
    return { error: "Firm bank accounts need a GL account (or assign the account to a client/entity)." };
  }

  try {
    const created = await createBankAccount(user, {
      name,
      accountId: accountId || null,
      institution: institution || null,
      accountType: accountType || null,
      swiftBic: swiftBic || null,
      iban: iban || null,
      bankAddress: bankAddress || null,
      bankCountry: bankCountry || null,
      accountNumber: accountNumber || null,
      routingNumber: routingNumber || null,
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
