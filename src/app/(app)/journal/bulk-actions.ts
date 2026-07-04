"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import {
  approveJournalEntry,
  submitJournalEntryForApproval,
} from "@/lib/mutations";
import { hasPermission } from "@/lib/permissions";

function ids(formData: FormData): string[] {
  return formData
    .getAll("entryIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

/**
 * Bulk submit-for-approval of DRAFT journal entries. Each id runs through
 * the same submitJournalEntryForApproval mutation, which re-checks the
 * permission and status per-item — the selection is never trusted. Items
 * that can't be submitted are skipped and counted; the loop never aborts on
 * one bad row.
 */
export async function bulkSubmitEntriesAction(
  formData: FormData,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "journal_entry.create")) {
    redirect(
      `/journal?error=${encodeURIComponent(
        "You don't have permission to submit entries.",
      )}`,
    );
  }

  const entryIds = ids(formData);
  if (entryIds.length === 0) {
    redirect(`/journal?error=${encodeURIComponent("Select at least one entry.")}`);
  }

  let ok = 0;
  let skipped = 0;
  for (const id of entryIds) {
    try {
      await submitJournalEntryForApproval(user, id);
      ok++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/journal");
  const msg =
    skipped > 0
      ? `Submitted ${ok}; skipped ${skipped} (not draft / not eligible).`
      : `Submitted ${ok} for approval.`;
  redirect(`/journal?error=${encodeURIComponent(msg)}`);
}

/**
 * Bulk approve journal entries awaiting approval. Each id runs through
 * approveJournalEntry, which enforces the permission AND segregation of
 * duties (the submitter/creator can't approve) per-item. Entries the viewer
 * may not approve are skipped, not force-approved.
 */
export async function bulkApproveEntriesAction(
  formData: FormData,
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "journal_entry.approve")) {
    redirect(
      `/journal?error=${encodeURIComponent(
        "You don't have permission to approve entries.",
      )}`,
    );
  }

  const entryIds = ids(formData);
  if (entryIds.length === 0) {
    redirect(`/journal?error=${encodeURIComponent("Select at least one entry.")}`);
  }

  let ok = 0;
  let skipped = 0;
  for (const id of entryIds) {
    try {
      await approveJournalEntry(user, id);
      ok++;
    } catch {
      // SoD violation, wrong status, etc. — skip, don't abort the batch.
      skipped++;
    }
  }

  revalidatePath("/journal");
  const msg =
    skipped > 0
      ? `Approved ${ok}; skipped ${skipped} (segregation of duties / not pending).`
      : `Approved ${ok} entr${ok === 1 ? "y" : "ies"}.`;
  redirect(`/journal?error=${encodeURIComponent(msg)}`);
}
