"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createAssetSnapshot,
  deleteAsset,
  updateAsset,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
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

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function updateAssetAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/aua");

  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const currencyCode = String(formData.get("currencyCode") ?? "").trim();
  const externalRef = String(formData.get("externalRef") ?? "").trim();
  const acquiredDate = String(formData.get("acquiredDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    await updateAsset(user, id, {
      name: name || undefined,
      kind: (VALID_KINDS as readonly string[]).includes(kindRaw)
        ? (kindRaw as AssetKind)
        : undefined,
      entityId: entityId || undefined,
      currencyCode: currencyCode || undefined,
      externalRef: externalRef || null,
      acquiredDate: acquiredDate || null,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect(`/aua/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/aua");
  revalidatePath(`/aua/${id}`);
  redirect(`/aua/${id}?saved=1`);
}

export async function addSnapshotAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const assetId = String(formData.get("assetId") ?? "");
  if (!assetId) redirect("/aua");

  const snapshotDate = String(formData.get("snapshotDate") ?? "").trim();
  const valueStr = String(formData.get("value") ?? "").trim();
  const currencyCode = String(formData.get("currencyCode") ?? "USD").trim();
  const source = String(formData.get("source") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!snapshotDate) {
    redirect(`/aua/${assetId}?error=${encodeURIComponent("Snapshot date is required.")}`);
  }
  const value = parseAmount(valueStr);
  if (!Number.isFinite(value) || value < 0) {
    redirect(`/aua/${assetId}?error=${encodeURIComponent("Value must be ≥ 0.")}`);
  }

  try {
    await createAssetSnapshot(user, {
      assetId,
      snapshotDate,
      value,
      currencyCode: currencyCode || "USD",
      source: source || null,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Snapshot failed";
    redirect(`/aua/${assetId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/aua");
  revalidatePath(`/aua/${assetId}`);
  redirect(`/aua/${assetId}?saved=1`);
}

export async function deleteAssetAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/aua");
  try {
    await deleteAsset(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect(`/aua/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/aua");
  redirect("/aua");
}
