"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createSigner,
  deleteBankAccount,
  deleteSigner,
  updateBankAccount,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import type { SigningAuthority } from "@/lib/types";

const VALID_AUTHORITY: SigningAuthority[] = ["sole", "joint", "limited", "view_only"];

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function updateBankAccountAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/bank");

  const name = String(formData.get("name") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const institution = String(formData.get("institution") ?? "").trim();
  const lastFour = String(formData.get("lastFour") ?? "").trim();
  const currencyCode = String(formData.get("currencyCode") ?? "").trim();
  const entityId = String(formData.get("entityId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const balanceRaw = String(formData.get("currentBalance") ?? "").trim();
  const balanceAsOf = String(formData.get("balanceAsOf") ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  const ownershipRaw = String(formData.get("ownershipPercent") ?? "").trim();
  const ownershipPercent =
    ownershipRaw === ""
      ? null
      : Math.max(0, Math.min(100, parseFloat(ownershipRaw)));

  try {
    await updateBankAccount(user, id, {
      name: name || undefined,
      accountId: accountId || undefined,
      institution: institution || null,
      lastFour: lastFour || null,
      currencyCode: currencyCode || undefined,
      entityId: entityId || null,
      clientId: clientId || null,
      currentBalance: balanceRaw === "" ? null : parseAmount(balanceRaw),
      balanceAsOf: balanceAsOf || null,
      isActive,
      ownershipPercent,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect(`/bank/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/bank");
  revalidatePath(`/bank/${id}`);
  redirect(`/bank/${id}?saved=1`);
}

export async function addSignerAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!bankAccountId) redirect("/bank");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const authorityRaw = String(formData.get("authority") ?? "joint");
  const isPrimary = formData.get("isPrimary") === "on";
  const addedDate = String(formData.get("addedDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) {
    redirect(`/bank/${bankAccountId}?error=${encodeURIComponent("Signer name is required.")}`);
  }
  const authority = (VALID_AUTHORITY as readonly string[]).includes(authorityRaw)
    ? (authorityRaw as SigningAuthority)
    : "joint";
  try {
    await createSigner(user, {
      bankAccountId,
      name,
      email: email || null,
      title: title || null,
      authority,
      isPrimary,
      addedDate: addedDate || null,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Add signer failed";
    redirect(`/bank/${bankAccountId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/bank/${bankAccountId}`);
  redirect(`/bank/${bankAccountId}?saved=1`);
}

export async function deleteSignerAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!id || !bankAccountId) redirect("/bank");
  try {
    await deleteSigner(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath(`/bank/${bankAccountId}`);
  redirect(`/bank/${bankAccountId}?saved=1`);
}

export async function deleteBankAccountAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/bank");
  try {
    await deleteBankAccount(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect(`/bank/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/bank");
  redirect("/bank");
}
