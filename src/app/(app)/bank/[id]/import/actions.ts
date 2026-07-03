"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import { parseBankStatementCsv } from "@/lib/csv-adapters";
import { importBankStatement } from "@/lib/mutations";

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
 * Import a bank-statement CSV for one bank account. Accepts either an
 * uploaded file or pasted CSV text; parses with the flexible bank-statement
 * adapter, then hands the normalized rows to `importBankStatement` (which
 * dedupes + records the statement_imports batch).
 */
export async function importStatementAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!bankAccountId) redirect("/bank");
  const back = `/bank/${bankAccountId}/import`;

  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "").trim();

  let text = "";
  let fileName = "pasted.csv";
  if (file instanceof File && file.size > 0) {
    text = await file.text();
    fileName = file.name || fileName;
  } else if (pasted) {
    text = pasted;
  } else {
    redirect(`${back}?error=${encodeURIComponent("Upload a CSV file or paste CSV text.")}`);
  }

  const parsed = parseBankStatementCsv(text);
  if (parsed.headerError) {
    redirect(`${back}?error=${encodeURIComponent(parsed.headerError)}`);
  }
  if (parsed.rows.length === 0) {
    const detail = parsed.errors.slice(0, 3).join(" ");
    redirect(
      `${back}?error=${encodeURIComponent(`No importable rows found. ${detail}`.trim())}`,
    );
  }

  let imported = 0;
  let duplicates = 0;
  try {
    const result = await importBankStatement(user, {
      bankAccountId,
      fileName,
      rows: parsed.rows,
    });
    imported = result.imported;
    duplicates = result.duplicates;
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Import failed.";
    redirect(`${back}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath(`/bank/${bankAccountId}`);
  revalidatePath(`/bank/${bankAccountId}/import`);
  revalidatePath("/reconciliation");
  redirect(
    `${back}?imported=${imported}&skipped=${duplicates}&badrows=${parsed.errors.length}`,
  );
}
