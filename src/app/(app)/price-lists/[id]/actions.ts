"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  clonePriceList,
  createPriceListEntry,
  deletePriceList,
  deletePriceListEntry,
  updatePriceList,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import type { PriceListItemType } from "@/lib/types";

const VALID_ITEM_TYPES: PriceListItemType[] = [
  "entity_fee",
  "time_rate",
  "service",
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

export async function updatePriceListAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/price-lists");

  const name = String(formData.get("name") ?? "").trim();
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  const versionStr = String(formData.get("versionNumber") ?? "").trim();
  const isCurrent = formData.get("isCurrent") === "on";
  const isActive = formData.get("isActive") === "on";
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    await updatePriceList(user, id, {
      name: name || undefined,
      effectiveDate: effectiveDate || undefined,
      versionNumber: versionStr ? parseInt(versionStr, 10) : undefined,
      isCurrent,
      isActive,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect(`/price-lists/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/price-lists");
  revalidatePath(`/price-lists/${id}`);
  redirect(`/price-lists/${id}?saved=1`);
}

export async function clonePriceListAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  const setCurrent = formData.get("setCurrent") === "on";

  if (!id) redirect("/price-lists");
  try {
    const created = await clonePriceList(user, id, {
      name: name || "(cloned)",
      effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
      setCurrent,
    });
    revalidatePath("/price-lists");
    revalidatePath(`/price-lists/${created.id}`);
    redirect(`/price-lists/${created.id}?saved=1`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Clone failed";
    redirect(`/price-lists/${id}?error=${encodeURIComponent(msg)}`);
  }
}

export async function addEntryAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const priceListId = String(formData.get("priceListId") ?? "");
  if (!priceListId) redirect("/price-lists");

  const itemTypeRaw = String(formData.get("itemType") ?? "");
  const itemKey = String(formData.get("itemKey") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const unitPrice = parseAmount(String(formData.get("unitPrice") ?? ""));
  const includedQtyStr = String(formData.get("includedQuantity") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!(VALID_ITEM_TYPES as readonly string[]).includes(itemTypeRaw)) {
    redirect(`/price-lists/${priceListId}?error=${encodeURIComponent("Invalid item type.")}`);
  }
  if (!itemKey || !label) {
    redirect(`/price-lists/${priceListId}?error=${encodeURIComponent("Key and label are required.")}`);
  }
  try {
    await createPriceListEntry(user, {
      priceListId,
      itemType: itemTypeRaw as PriceListItemType,
      itemKey,
      label,
      unitPrice,
      includedQuantity: includedQtyStr === "" ? null : parseAmount(includedQtyStr),
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Add entry failed";
    redirect(`/price-lists/${priceListId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/price-lists/${priceListId}`);
  redirect(`/price-lists/${priceListId}?saved=1`);
}

export async function deleteEntryAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const priceListId = String(formData.get("priceListId") ?? "");
  if (!id || !priceListId) redirect("/price-lists");
  try {
    await deletePriceListEntry(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath(`/price-lists/${priceListId}`);
  redirect(`/price-lists/${priceListId}?saved=1`);
}

export async function deletePriceListAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/price-lists");
  try {
    await deletePriceList(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect(`/price-lists/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/price-lists");
  redirect("/price-lists");
}
