"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createAsset } from "@/lib/mutations";
import type { AssetKind } from "@/lib/types";

const VALID_KINDS: AssetKind[] = [
  "real_estate",
  "securities",
  "cash",
  "private_equity",
  "art",
  "vehicle",
  "business_interest",
  "intellectual_property",
  "other",
];

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
  if (!(VALID_KINDS as readonly string[]).includes(kindRaw)) {
    return { error: "Invalid asset kind." };
  }

  try {
    const created = await createAsset(user, {
      name,
      kind: kindRaw as AssetKind,
      entityId,
      clientId: null,
      currencyCode: currencyCode || "USD",
      externalRef: externalRef || null,
      acquiredDate: acquiredDate || null,
      valuationDate: valuationDate || null,
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
