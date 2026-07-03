"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  createBankTransaction,
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
  // Blank = keep the number on file (the form never echoes the full
  // number back, so an untouched field must not clear it).
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const routingNumber = String(formData.get("routingNumber") ?? "").trim();
  const accountType = String(formData.get("accountType") ?? "").trim();
  const swiftBic = String(formData.get("swiftBic") ?? "").trim();
  const iban = String(formData.get("iban") ?? "").trim();
  const bankAddress = String(formData.get("bankAddress") ?? "").trim();
  const bankCountry = String(formData.get("bankCountry") ?? "").trim().toUpperCase();
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
      accountId: accountId || null,
      institution: institution || null,
      ...(accountNumber !== "" && { accountNumber }),
      routingNumber: routingNumber || null,
      accountType: accountType || null,
      swiftBic: swiftBic || null,
      iban: iban || null,
      bankAddress: bankAddress || null,
      bankCountry: bankCountry || null,
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

/** Manual bank transaction entry — source='manual'. */
export async function addBankTransactionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!bankAccountId) redirect("/bank");

  const transactionDate = String(formData.get("transactionDate") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const direction = String(formData.get("direction") ?? "deposit");
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();

  const magnitude = Math.abs(parseAmount(amountRaw));
  if (!(magnitude > 0)) {
    redirect(
      `/bank/${bankAccountId}?error=${encodeURIComponent("Amount must be greater than zero.")}`,
    );
  }
  // Sign convention everywhere in bank_transactions: deposits positive,
  // withdrawals negative.
  const amount = direction === "withdrawal" ? -magnitude : magnitude;

  try {
    await createBankTransaction(user, {
      bankAccountId,
      transactionDate,
      description,
      amount,
      reference: reference || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Could not add the transaction.";
    redirect(`/bank/${bankAccountId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/bank/${bankAccountId}`);
  revalidatePath("/reconciliation");
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
