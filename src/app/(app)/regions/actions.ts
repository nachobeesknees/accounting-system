"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createRegion,
  createRegionGroup,
  deleteRegion,
  deleteRegionGroup,
  setOfficeRegion,
  updateRegion,
  updateRegionGroup,
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

function revalidate() {
  revalidatePath("/regions");
  revalidatePath("/offices");
}

// ---- Region groups ----

export async function createRegionGroupAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/regions?error=" + encodeURIComponent("Group name is required."));
  }
  try {
    await createRegionGroup(user, { name });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect("/regions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/regions?saved=1");
}

export async function updateRegionGroupAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) {
    redirect("/regions?error=" + encodeURIComponent("Group name is required."));
  }
  try {
    await updateRegionGroup(user, id, { name });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect("/regions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/regions?saved=1");
}

export async function deleteRegionGroupAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/regions");
  try {
    await deleteRegionGroup(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect("/regions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/regions?saved=1");
}

// ---- Regions ----

export async function createRegionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "").trim();
  const groupId = String(formData.get("groupId") ?? "").trim() || null;
  if (!name) {
    redirect("/regions?error=" + encodeURIComponent("Region name is required."));
  }
  try {
    await createRegion(user, { name, groupId });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect("/regions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/regions?saved=1");
}

export async function updateRegionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const groupId = String(formData.get("groupId") ?? "").trim() || null;
  if (!id || !name) {
    redirect("/regions?error=" + encodeURIComponent("Region name is required."));
  }
  try {
    await updateRegion(user, id, { name, groupId });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect("/regions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/regions?saved=1");
}

export async function deleteRegionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/regions");
  try {
    await deleteRegion(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect("/regions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/regions?saved=1");
}

// ---- Office region picker (used from /offices) ----

export async function setOfficeRegionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const officeId = String(formData.get("officeId") ?? "").trim();
  const raw = String(formData.get("regionId") ?? "").trim();
  const regionId = raw ? raw : null;
  if (!officeId) redirect("/offices");
  try {
    await setOfficeRegion(user, officeId, regionId);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect("/offices?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/offices");
  revalidatePath("/regions");
  redirect("/offices?saved=1");
}
