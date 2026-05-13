"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import {
  assignedApproveInvoice,
  cfoApproveInvoice,
  postInvoice,
  recordInvoicePayment,
  rejectInvoice,
  submitInvoiceForApproval,
  voidInvoice,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function revalidateAfterMutation(invoiceId: string): void {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/");
  revalidatePath("/journal");
}

export async function postInvoiceAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) {
    redirect(`/invoices?error=${encodeURIComponent("Missing invoice id.")}`);
  }

  try {
    await postInvoice(user, invoiceId);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Failed to post invoice.";
    redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(message)}`);
  }

  revalidateAfterMutation(invoiceId);
  redirect(`/invoices/${invoiceId}`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) {
    redirect(`/invoices?error=${encodeURIComponent("Missing invoice id.")}`);
  }

  const amountRaw = String(formData.get("amount") ?? "");
  const paymentDate = String(formData.get("paymentDate") ?? "");
  const bankAccountIdRaw = String(formData.get("bankAccountId") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();

  const amount = parseAmount(amountRaw);
  if (!(amount > 0)) {
    redirect(
      `/invoices/${invoiceId}?error=${encodeURIComponent("Payment amount must be > 0.")}`,
    );
  }
  if (!paymentDate) {
    redirect(
      `/invoices/${invoiceId}?error=${encodeURIComponent("Payment date is required.")}`,
    );
  }

  let entryNumber = "";
  try {
    const result = await recordInvoicePayment(user, {
      invoiceId,
      amount,
      paymentDate,
      bankAccountId: bankAccountIdRaw === "" ? null : bankAccountIdRaw,
      reference: reference === "" ? null : reference,
    });
    entryNumber = result.entryNumber;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message =
      err instanceof Error ? err.message : "Failed to record payment.";
    redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(message)}`);
  }

  revalidateAfterMutation(invoiceId);
  redirect(
    `/invoices/${invoiceId}?recorded=${encodeURIComponent(entryNumber)}`,
  );
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Voided";
  if (!invoiceId) {
    redirect(`/invoices?error=${encodeURIComponent("Missing invoice id.")}`);
  }

  try {
    await voidInvoice(user, invoiceId, reason);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Failed to void invoice.";
    redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(message)}`);
  }

  revalidateAfterMutation(invoiceId);
  redirect(`/invoices/${invoiceId}`);
}

export async function submitInvoiceForApprovalAction(
  formData: FormData,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) {
    redirect(`/invoices?error=${encodeURIComponent("Missing invoice id.")}`);
  }

  try {
    await submitInvoiceForApproval(user, invoiceId);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message =
      err instanceof Error ? err.message : "Failed to submit invoice.";
    redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(message)}`);
  }

  revalidateAfterMutation(invoiceId);
  redirect(`/invoices/${invoiceId}?submitted=1`);
}

export async function cfoApproveInvoiceAction(
  formData: FormData,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) {
    redirect(`/invoices?error=${encodeURIComponent("Missing invoice id.")}`);
  }

  try {
    await cfoApproveInvoice(user, invoiceId);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message =
      err instanceof Error ? err.message : "Failed to approve invoice.";
    redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(message)}`);
  }

  revalidateAfterMutation(invoiceId);
  redirect(`/invoices/${invoiceId}?approved=cfo`);
}

export async function assignedApproveInvoiceAction(
  formData: FormData,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) {
    redirect(`/invoices?error=${encodeURIComponent("Missing invoice id.")}`);
  }

  try {
    await assignedApproveInvoice(user, invoiceId);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message =
      err instanceof Error ? err.message : "Failed to approve invoice.";
    redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(message)}`);
  }

  revalidateAfterMutation(invoiceId);
  redirect(`/invoices/${invoiceId}?approved=assigned`);
}

export async function rejectInvoiceAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!invoiceId) {
    redirect(`/invoices?error=${encodeURIComponent("Missing invoice id.")}`);
  }
  if (!reason) {
    redirect(
      `/invoices/${invoiceId}?error=${encodeURIComponent("A rejection reason is required.")}`,
    );
  }

  try {
    await rejectInvoice(user, invoiceId, reason);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message =
      err instanceof Error ? err.message : "Failed to reject invoice.";
    redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(message)}`);
  }

  revalidateAfterMutation(invoiceId);
  redirect(`/invoices/${invoiceId}?rejected=1`);
}
