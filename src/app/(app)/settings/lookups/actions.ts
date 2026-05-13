"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createLookupTable,
  createLookupValue,
  deleteLookupTable,
  deleteLookupValue,
  updateLookupValue,
} from "@/lib/mutations";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isSuperuser) redirect("/settings/lookups?error=" + encodeURIComponent("Admin only."));
  return user;
}

export async function createTableAction(formData: FormData) {
  const user = await requireAdmin();
  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!key || !label) {
    redirect("/settings/lookups?error=" + encodeURIComponent("Key and label required."));
  }
  try {
    await createLookupTable(user, { key, label, description: description || null });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect("/settings/lookups?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/settings/lookups");
  redirect("/settings/lookups?saved=1&table=" + encodeURIComponent(key));
}

export async function deleteTableAction(formData: FormData) {
  const user = await requireAdmin();
  const key = String(formData.get("key") ?? "");
  try {
    await deleteLookupTable(user, key);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/settings/lookups");
  redirect("/settings/lookups");
}

export async function addValueAction(formData: FormData) {
  const user = await requireAdmin();
  const tableKey = String(formData.get("tableKey") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const sortOrder = parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0;
  if (!tableKey || !code || !label) {
    redirect(
      `/settings/lookups?table=${tableKey}&error=${encodeURIComponent("Code and label required.")}`,
    );
  }
  try {
    await createLookupValue(user, { tableKey, code, label, sortOrder });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect(`/settings/lookups?table=${tableKey}&error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/settings/lookups");
  redirect(`/settings/lookups?table=${tableKey}&saved=1`);
}

export async function updateValueAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const tableKey = String(formData.get("tableKey") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const sortOrder = parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0;
  const isActive = formData.get("isActive") === "on";
  try {
    await updateLookupValue(user, id, {
      label: label || undefined,
      sortOrder,
      isActive,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/settings/lookups");
  redirect(`/settings/lookups?table=${tableKey}&saved=1`);
}

export async function deleteValueAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const tableKey = String(formData.get("tableKey") ?? "");
  try {
    await deleteLookupValue(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/settings/lookups");
  redirect(`/settings/lookups?table=${tableKey}`);
}
