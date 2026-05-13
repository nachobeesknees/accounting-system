"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createContactLink,
  deleteContact,
  deleteContactLink,
  updateContact,
} from "@/lib/mutations";
import type { ContactLinkRefType } from "@/lib/types";

const VALID_REF: ContactLinkRefType[] = [
  "entity",
  "bank_account",
  "invoice",
  "bill",
  "asset",
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

export async function updateContactAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/contacts");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as "individual" | "organization";
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const isClient = formData.get("isClient") === "on";
  const isVendor = formData.get("isVendor") === "on";
  const isEmployee = formData.get("isEmployee") === "on";
  const isIntermediary = formData.get("isIntermediary") === "on";
  const isActive = formData.get("isActive") === "on";

  try {
    await updateContact(user, id, {
      code: code || undefined,
      name: name || undefined,
      kind: kind === "individual" || kind === "organization" ? kind : undefined,
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      isClient,
      isVendor,
      isEmployee,
      isIntermediary,
      isActive,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect(`/contacts/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}?saved=1`);
}

export async function addLinkAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const contactId = String(formData.get("contactId") ?? "");
  const refTypeRaw = String(formData.get("refType") ?? "");
  const refId = String(formData.get("refId") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!contactId || !refId || !(VALID_REF as readonly string[]).includes(refTypeRaw)) {
    redirect(`/contacts/${contactId}?error=${encodeURIComponent("Ref type and id required.")}`);
  }
  try {
    await createContactLink(user, {
      contactId,
      refType: refTypeRaw as ContactLinkRefType,
      refId,
      role: role || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Add link failed";
    redirect(`/contacts/${contactId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}?saved=1`);
}

export async function deleteLinkAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  if (!id || !contactId) redirect("/contacts");
  try {
    await deleteContactLink(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}?saved=1`);
}

export async function deleteContactAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/contacts");
  try {
    await deleteContact(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect(`/contacts/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/contacts");
  redirect("/contacts");
}
