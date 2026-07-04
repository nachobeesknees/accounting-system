"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import { getInvoiceById } from "@/lib/data";
import {
  assignedApproveInvoice,
  cfoApproveInvoice,
  submitInvoiceForApproval,
} from "@/lib/mutations";
import { hasPermission } from "@/lib/permissions";

function ids(formData: FormData): string[] {
  return formData
    .getAll("invoiceIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

/**
 * Bulk submit DRAFT invoices for approval. Each id runs through
 * submitInvoiceForApproval, which re-checks the permission and that the
 * invoice is a draft. Non-draft rows are skipped; the batch never aborts on
 * a single failure.
 */
export async function bulkSubmitInvoicesAction(
  formData: FormData,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "invoice.update")) {
    redirect(
      `/invoices?error=${encodeURIComponent(
        "You don't have permission to submit invoices.",
      )}`,
    );
  }

  const invoiceIds = ids(formData);
  if (invoiceIds.length === 0) {
    redirect(`/invoices?error=${encodeURIComponent("Select at least one invoice.")}`);
  }

  let ok = 0;
  let skipped = 0;
  for (const id of invoiceIds) {
    try {
      await submitInvoiceForApproval(user, id);
      ok++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/invoices");
  const msg =
    skipped > 0
      ? `Submitted ${ok}; skipped ${skipped} (not draft).`
      : `Submitted ${ok} invoice${ok === 1 ? "" : "s"} for approval.`;
  redirect(`/invoices?error=${encodeURIComponent(msg)}`);
}

/**
 * Bulk advance invoices through the approval workflow WHERE LEGAL for this
 * viewer. For each selected invoice we advance one step:
 *   pending_cfo      → cfoApproveInvoice   (needs invoice.approve)
 *   pending_assigned → assignedApproveInvoice (assigned employee / admin)
 * Both underlying mutations enforce their own permission + assignment
 * checks, so a row the viewer may not approve is skipped, never forced.
 */
export async function bulkApproveInvoicesAction(
  formData: FormData,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const invoiceIds = ids(formData);
  if (invoiceIds.length === 0) {
    redirect(`/invoices?error=${encodeURIComponent("Select at least one invoice.")}`);
  }

  let ok = 0;
  let skipped = 0;
  for (const id of invoiceIds) {
    try {
      const inv = await getInvoiceById(id);
      if (!inv) {
        skipped++;
        continue;
      }
      if (inv.status === "pending_cfo") {
        await cfoApproveInvoice(user, id);
        ok++;
      } else if (inv.status === "pending_assigned") {
        await assignedApproveInvoice(user, id);
        ok++;
      } else {
        skipped++;
      }
    } catch {
      // permission / assignment / state failure — skip this row.
      skipped++;
    }
  }

  revalidatePath("/invoices");
  const msg =
    skipped > 0
      ? `Advanced ${ok}; skipped ${skipped} (not pending / not yours to approve).`
      : `Advanced ${ok} invoice${ok === 1 ? "" : "s"}.`;
  redirect(`/invoices?error=${encodeURIComponent(msg)}`);
}
