"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
