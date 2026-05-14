"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createDimension,
  createDimensionValue,
  deleteDimension,
  deleteDimensionValue,
  updateDimension,
  updateDimensionValue,
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
  revalidatePath("/settings/dimensions");
}

// ---- Dimensions ----

export async function createDimensionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!key || !label) {
    redirect(
      "/settings/dimensions?error=" +
        encodeURIComponent("Key and label are required."),
    );
  }
  try {
    await createDimension(user, {
      key,
      label,
      description: description === "" ? null : description,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect("/settings/dimensions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/settings/dimensions?saved=1");
}

export async function updateDimensionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isActive = formData.get("isActive") != null;
  if (!id || !label) {
    redirect(
      "/settings/dimensions?error=" + encodeURIComponent("Label is required."),
    );
  }
  try {
    await updateDimension(user, id, {
      label,
      description: description === "" ? null : description,
      isActive,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect("/settings/dimensions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/settings/dimensions?saved=1");
}

export async function deleteDimensionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/settings/dimensions");
  try {
    await deleteDimension(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect("/settings/dimensions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/settings/dimensions?saved=1");
}

// ---- Dimension values ----

export async function createDimensionValueAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const dimensionId = String(formData.get("dimensionId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!dimensionId || !code || !label) {
    redirect(
      "/settings/dimensions?error=" +
        encodeURIComponent("Code and label are required."),
    );
  }
  try {
    await createDimensionValue(user, { dimensionId, code, label });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect("/settings/dimensions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/settings/dimensions?saved=1");
}

export async function updateDimensionValueAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const isActive = formData.get("isActive") != null;
  if (!id || !code || !label) {
    redirect(
      "/settings/dimensions?error=" +
        encodeURIComponent("Code and label are required."),
    );
  }
  try {
    await updateDimensionValue(user, id, { code, label, isActive });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect("/settings/dimensions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/settings/dimensions?saved=1");
}

export async function deleteDimensionValueAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/settings/dimensions");
  try {
    await deleteDimensionValue(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect("/settings/dimensions?error=" + encodeURIComponent(msg));
  }
  revalidate();
  redirect("/settings/dimensions?saved=1");
}
