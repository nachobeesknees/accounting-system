"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  updateCustomFieldDefinition,
} from "@/lib/mutations";
import type {
  CustomFieldRecordType,
  CustomFieldType,
} from "@/lib/types";

const VALID_RECORDS: CustomFieldRecordType[] = [
  "entity",
  "contact",
  "asset",
  "bank_account",
];
const VALID_TYPES: CustomFieldType[] = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
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

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isSuperuser)
    redirect("/settings/custom-fields?error=" + encodeURIComponent("Admin only."));
  return user;
}

export async function createDefinitionAction(formData: FormData) {
  const user = await requireAdmin();
  const recordType = String(formData.get("recordType") ?? "") as CustomFieldRecordType;
  const fieldKey = String(formData.get("fieldKey") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const fieldType = String(formData.get("fieldType") ?? "") as CustomFieldType;
  const sortOrder = parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0;
  const isRequired = formData.get("isRequired") === "on";
  const optionsRaw = String(formData.get("options") ?? "").trim();
  const helpText = String(formData.get("helpText") ?? "").trim();

  if (!VALID_RECORDS.includes(recordType)) {
    redirect(
      "/settings/custom-fields?error=" + encodeURIComponent("Invalid record type."),
    );
  }
  if (!VALID_TYPES.includes(fieldType)) {
    redirect(
      "/settings/custom-fields?error=" + encodeURIComponent("Invalid field type."),
    );
  }
  if (!fieldKey || !label) {
    redirect(
      "/settings/custom-fields?error=" + encodeURIComponent("Key and label required."),
    );
  }
  const options =
    fieldType === "select"
      ? optionsRaw
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : null;

  try {
    await createCustomFieldDefinition(user, {
      recordType,
      fieldKey,
      label,
      fieldType,
      options,
      sortOrder,
      isRequired,
      helpText: helpText || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect("/settings/custom-fields?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/settings/custom-fields");
  revalidatePath("/entities");
  revalidatePath("/contacts");
  revalidatePath("/aua");
  revalidatePath("/bank");
  redirect("/settings/custom-fields?saved=1");
}

export async function updateDefinitionAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const sortOrder = parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0;
  const isRequired = formData.get("isRequired") === "on";
  const isActive = formData.get("isActive") === "on";
  const helpText = String(formData.get("helpText") ?? "").trim();
  try {
    await updateCustomFieldDefinition(user, id, {
      label: label || undefined,
      sortOrder,
      isRequired,
      isActive,
      helpText: helpText || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/settings/custom-fields");
  redirect("/settings/custom-fields?saved=1");
}

export async function deleteDefinitionAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  try {
    await deleteCustomFieldDefinition(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/settings/custom-fields");
  redirect("/settings/custom-fields?saved=1");
}
