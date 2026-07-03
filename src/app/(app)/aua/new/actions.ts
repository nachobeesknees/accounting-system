"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createAsset, createBankAccount } from "@/lib/mutations";
import { ASSET_KINDS, parseAssetDetails } from "@/lib/asset-fields";
import type { AssetKind } from "@/lib/types";

export type CreateAssetState = { error: string | null };

export async function createAssetAction(
  _prev: CreateAssetState,
  formData: FormData,
): Promise<CreateAssetState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "");
  const entityId = String(formData.get("entityId") ?? "").trim();
  const currencyCode = String(formData.get("currencyCode") ?? "USD").trim();
  const externalRef = String(formData.get("externalRef") ?? "").trim();
  const acquiredDate = String(formData.get("acquiredDate") ?? "").trim();
  const valuationDate = String(formData.get("valuationDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!entityId) {
    return { error: "Entity is required — assets are entity-scoped." };
  }
  if (!(ASSET_KINDS as readonly string[]).includes(kindRaw)) {
    return { error: "Invalid asset kind." };
  }
  const kind = kindRaw as AssetKind;
  const details = parseAssetDetails(formData, kind);

  // kind = bank_account: link an existing bank_accounts row, or create one
  // inline from the bankNew[...] fields (account number stored full, shown
  // masked; signers get added on the bank account page).
  let bankAccountId: string | null = null;
  if (kind === "bank_account") {
    bankAccountId = String(formData.get("bankAccountId") ?? "").trim() || null;
    if (!bankAccountId) {
      const glAccountId = String(formData.get("bankNew[accountId]") ?? "").trim();
      const institution = String(formData.get("bankNew[institution]") ?? "").trim();
      const routingNumber = String(formData.get("bankNew[routingNumber]") ?? "").trim();
      const accountNumber = String(formData.get("bankNew[accountNumber]") ?? "").trim();
      if (!glAccountId) {
        return {
          error:
            "Pick an existing bank account or a GL account for the new one.",
        };
      }
      try {
        const bank = await createBankAccount(user, {
          name,
          accountId: glAccountId,
          institution: institution || null,
          routingNumber: routingNumber || null,
          accountNumber: accountNumber || null,
          currencyCode: currencyCode || "USD",
          entityId,
        });
        bankAccountId = bank.id;
        revalidatePath("/bank");
      } catch (err) {
        return {
          error:
            err instanceof Error ? err.message : "Failed to create bank account.",
        };
      }
    }
  }

  try {
    await createAsset(user, {
      name,
      kind,
      entityId,
      clientId: null,
      currencyCode: currencyCode || "USD",
      externalRef: externalRef || null,
      acquiredDate: acquiredDate || null,
      valuationDate: valuationDate || null,
      details,
      bankAccountId,
      notes: notes || null,
    });
    revalidatePath("/aua");
    revalidatePath(`/entities/${entityId}`);
    redirect(`/entities/${entityId}?saved=1`);
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
    return { error: err instanceof Error ? err.message : "Failed to create asset." };
  }
}
