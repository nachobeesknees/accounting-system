"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { parseCsv } from "@/lib/csv";
import { ADAPTERS, type CsvTypeKey } from "@/lib/csv-adapters";
import { INITIAL_IMPORT_STATE, type ImportState, type RowResult } from "./types";

export async function processCsvAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isSuperuser) {
    return { ...INITIAL_IMPORT_STATE, error: "Admin only." };
  }

  const typeRaw = String(formData.get("type") ?? "");
  const dryRun = formData.get("commit") !== "on";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ...INITIAL_IMPORT_STATE, type: typeRaw as CsvTypeKey, error: "Upload a CSV file." };
  }
  const adapter = ADAPTERS[typeRaw as CsvTypeKey];
  if (!adapter) {
    return { ...INITIAL_IMPORT_STATE, error: `Unknown type: ${typeRaw}` };
  }

  const text = await file.text();
  const parsed = parseCsv(text);

  const requiredCols = adapter.columns.filter((c) => c.required).map((c) => c.name);
  const missing = requiredCols.filter((c) => !parsed.headers.includes(c));
  if (missing.length > 0) {
    return {
      ...INITIAL_IMPORT_STATE,
      type: adapter.key,
      fileName: file.name,
      dryRun,
      error: `Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
    };
  }

  const rowResults: RowResult[] = [];
  let okCount = 0;
  let failCount = 0;

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    if (dryRun) {
      const missingInRow = requiredCols.filter((c) => !row[c] || row[c].trim() === "");
      if (missingInRow.length > 0) {
        failCount++;
        rowResults.push({
          index: i + 2,
          values: row,
          result: { ok: false, error: `Missing: ${missingInRow.join(", ")}` },
        });
        continue;
      }
      okCount++;
      rowResults.push({ index: i + 2, values: row, result: { ok: true } });
      continue;
    }
    const result = await adapter.insert(user, row);
    if (result.ok) okCount++;
    else failCount++;
    rowResults.push({ index: i + 2, values: row, result });
  }

  if (!dryRun) {
    revalidatePath(`/${adapter.key === "time_entries" ? "time" : adapter.key}`);
    revalidatePath("/settings/import-export");
  }

  return {
    type: adapter.key,
    fileName: file.name,
    dryRun,
    totalRows: parsed.rows.length,
    okCount,
    failCount,
    rows: rowResults,
    error: null,
  };
}
