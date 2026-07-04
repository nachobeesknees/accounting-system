"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import { parseJournalEntriesCsv } from "@/lib/csv-adapters";
import {
  stageJournalEntriesFromCsv,
  type JournalCsvGroupInput,
  type JournalCsvGroupResult,
} from "@/lib/mutations";
import { PermissionError, requirePermission } from "@/lib/permissions";

export type JournalImportState = {
  error: string | null;
  staged: number;
  rejected: number;
  results: JournalCsvGroupResult[];
};

export const INITIAL_JOURNAL_IMPORT_STATE: JournalImportState = {
  error: null,
  staged: 0,
  rejected: 0,
  results: [],
};

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Parse a journal-entry CSV (grouped by Reference/Group) and stage each
 * valid group as a DRAFT manual JE. Per-group errors are reported without
 * aborting the whole file. Returns a state object for the client form.
 */
export async function importJournalEntriesAction(
  _prev: JournalImportState,
  formData: FormData,
): Promise<JournalImportState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    requirePermission(user, "journal_entry.create");
  } catch (err) {
    if (err instanceof PermissionError) {
      return {
        ...INITIAL_JOURNAL_IMPORT_STATE,
        error: "You don't have permission to import journal entries.",
      };
    }
    throw err;
  }

  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "").trim();

  let text = "";
  if (file instanceof File && file.size > 0) {
    text = await file.text();
  } else if (pasted) {
    text = pasted;
  } else {
    return {
      ...INITIAL_JOURNAL_IMPORT_STATE,
      error: "Upload a CSV file or paste CSV text.",
    };
  }

  const parsed = parseJournalEntriesCsv(text);
  if (parsed.headerError) {
    return { ...INITIAL_JOURNAL_IMPORT_STATE, error: parsed.headerError };
  }
  if (parsed.groups.length === 0) {
    return {
      ...INITIAL_JOURNAL_IMPORT_STATE,
      error: "No entries found in the file.",
    };
  }

  const groups: JournalCsvGroupInput[] = parsed.groups.map((g) => ({
    key: g.key,
    date: g.date,
    parseErrors: g.errors,
    lines: g.rows.map((r) => ({
      rowNo: r.rowNo,
      accountToken: r.accountToken,
      description: r.description,
      debit: r.debit,
      credit: r.credit,
      firmEntityToken: r.firmEntityToken,
    })),
  }));

  try {
    const { results, staged, rejected } = await stageJournalEntriesFromCsv(
      user,
      groups,
    );
    revalidatePath("/journal");
    return { error: null, staged, rejected, results };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return {
      ...INITIAL_JOURNAL_IMPORT_STATE,
      error: err instanceof Error ? err.message : "Import failed.",
    };
  }
}
