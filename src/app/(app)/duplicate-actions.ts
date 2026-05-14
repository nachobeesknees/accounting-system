"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  duplicateBill,
  duplicateInvoice,
  duplicateJournalEntry,
  generateNextRecurringEntry,
} from "@/lib/mutations";
import { getSessionUser } from "@/lib/session";

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Duplicate the journal entry whose id is provided in `entryId`. Lands on
 * the new draft entry's detail page so the user can edit and post.
 */
export async function duplicateJournalEntryAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const entryId = String(formData.get("entryId") ?? "").trim();
  if (!entryId) redirect("/journal");

  try {
    const created = await duplicateJournalEntry(user, entryId);
    revalidatePath("/journal");
    redirect(`/journal/${created.entryNumber}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg =
      err instanceof Error ? err.message : "Failed to duplicate entry.";
    redirect(`/journal?error=${encodeURIComponent(msg)}`);
  }
}

export async function duplicateInvoiceAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) redirect("/invoices");

  try {
    const created = await duplicateInvoice(user, invoiceId);
    revalidatePath("/invoices");
    redirect(`/invoices/${created.id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg =
      err instanceof Error ? err.message : "Failed to duplicate invoice.";
    redirect(`/invoices?error=${encodeURIComponent(msg)}`);
  }
}

/**
 * Generate the next journal entry from a recurring template. The new entry
 * is a draft dated `template.recurringNextDate`; the template's
 * `recurringNextDate` is advanced by its frequency. Lands on the new entry's
 * detail page so the user can review and post.
 */
export async function generateNextRecurringEntryAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!templateId) redirect("/journal?view=templates");

  try {
    const created = await generateNextRecurringEntry(user, templateId);
    revalidatePath("/journal");
    redirect(`/journal/${created.entryNumber}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg =
      err instanceof Error ? err.message : "Failed to generate entry.";
    redirect(`/journal?view=templates&error=${encodeURIComponent(msg)}`);
  }
}

export async function duplicateBillAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const billId = String(formData.get("billId") ?? "").trim();
  if (!billId) redirect("/bills");

  try {
    const created = await duplicateBill(user, billId);
    revalidatePath("/bills");
    redirect(`/bills/${created.id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg =
      err instanceof Error ? err.message : "Failed to duplicate bill.";
    redirect(`/bills?error=${encodeURIComponent(msg)}`);
  }
}
