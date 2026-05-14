"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUser } from "@/lib/session";
import {
  addCustomerAssignment,
  generateChargebackInvoice,
  removeCustomerAssignment,
  setCustomerAssignedUser,
} from "@/lib/mutations";

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function setAssignedUserAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) {
    redirect(`/customers?error=${encodeURIComponent("Missing customer id.")}`);
  }
  const raw = String(formData.get("assignedUserId") ?? "");
  const assignedUserId = raw === "" ? null : raw;

  try {
    await setCustomerAssignedUser(user, customerId, assignedUserId);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Save failed.";
    redirect(
      `/customers/${customerId}?error=${encodeURIComponent(message)}`,
    );
  }

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?saved=1`);
}

export async function addAssignmentAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const customerId = String(formData.get("customerId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const canApprove = formData.get("canApprove") === "1";
  const isPrimary = formData.get("isPrimary") === "1";

  if (!customerId || !userId) {
    redirect(`/customers/${customerId}?error=${encodeURIComponent("Pick a user first.")}`);
  }
  try {
    await addCustomerAssignment(user, { customerId, userId, isPrimary, canApprove });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Add failed.";
    redirect(`/customers/${customerId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?saved=1`);
}

export async function generateChargebackInvoiceAction(
  formData: FormData,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) {
    redirect(`/customers?error=${encodeURIComponent("Missing customer id.")}`);
  }
  const billIds = formData.getAll("billIds").map((v) => String(v));

  if (billIds.length === 0) {
    redirect(
      `/customers/${customerId}?error=${encodeURIComponent("Pick at least one bill to rebill.")}`,
    );
  }

  try {
    const inv = await generateChargebackInvoice(user, {
      clientId: customerId,
      billIds,
    });
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    revalidatePath("/bills");
    revalidatePath("/invoices");
    revalidatePath("/");
    redirect(`/invoices/${inv.id}?created=${encodeURIComponent(inv.invoiceNumber)}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to generate invoice.";
    redirect(`/customers/${customerId}?error=${encodeURIComponent(msg)}`);
  }
}

export async function removeAssignmentAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const customerId = String(formData.get("customerId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  try {
    await removeCustomerAssignment(user, assignmentId);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Remove failed.";
    redirect(`/customers/${customerId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?saved=1`);
}

/**
 * Update tax defaults on a customer. The rate input is taken as a
 * percent (e.g. "8.75") and stored as a decimal (0.0875). When the
 * "Exempt" checkbox is set, the rate stays whatever the user entered
 * but tax_exempt=true forces invoice tax to 0 — the value is preserved
 * in case the user later removes the exemption.
 */
export async function setCustomerTaxAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) {
    redirect(`/customers?error=${encodeURIComponent("Missing customer id.")}`);
  }

  const ratePctRaw = String(formData.get("taxRatePct") ?? "").trim();
  const ratePct = ratePctRaw === "" ? 0 : parseFloat(ratePctRaw);
  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    redirect(
      `/customers/${customerId}?error=${encodeURIComponent("Tax rate must be between 0 and 100.")}`,
    );
  }
  const taxRate = ratePct / 100;
  const taxExempt = formData.get("taxExempt") === "on";

  try {
    const db = getDb();
    await db
      .update(schema.customers)
      .set({
        taxRate: taxRate.toFixed(5),
        taxExempt,
        updatedAt: new Date(),
      })
      .where(eq(schema.customers.id, customerId));
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg = err instanceof Error ? err.message : "Could not update tax.";
    redirect(`/customers/${customerId}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=1`);
}
