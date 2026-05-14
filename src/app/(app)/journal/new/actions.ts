"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createJournalEntry } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import { stripPeriodErrorPrefix } from "@/lib/periods";
import type { RecurringFrequency } from "@/lib/types";

export type CreateEntryState = { error: string | null };

const VALID_FREQUENCIES: readonly RecurringFrequency[] = [
  "monthly",
  "quarterly",
  "annually",
  "custom",
];

type ParsedLine = {
  accountId: string;
  description: string;
  debit: number;
  credit: number;
  dimensions: Record<string, string>;
  intercompanyCounterpartEntityId: string | null;
};

function parseDimensionsForLine(
  formData: FormData,
  i: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  const prefix = `lines[${i}][dim][`;
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith(prefix)) continue;
    if (!name.endsWith("]")) continue;
    const key = name.slice(prefix.length, -1);
    const v = typeof value === "string" ? value.trim() : "";
    if (key && v) out[key] = v;
  }
  return out;
}

function parseLines(formData: FormData): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (let i = 0; i < 100; i++) {
    const accountId = formData.get(`lines[${i}][accountId]`);
    const description = formData.get(`lines[${i}][description]`);
    const debit = formData.get(`lines[${i}][debit]`);
    const credit = formData.get(`lines[${i}][credit]`);
    const counterpart = formData.get(`lines[${i}][counterpartEntityId]`);

    if (
      accountId == null &&
      description == null &&
      debit == null &&
      credit == null
    ) {
      // no more lines submitted
      break;
    }

    const rawCp = typeof counterpart === "string" ? counterpart.trim() : "";
    lines.push({
      accountId: typeof accountId === "string" ? accountId : "",
      description: typeof description === "string" ? description : "",
      debit: parseAmount(typeof debit === "string" ? debit : ""),
      credit: parseAmount(typeof credit === "string" ? credit : ""),
      dimensions: parseDimensionsForLine(formData, i),
      intercompanyCounterpartEntityId: rawCp === "" ? null : rawCp,
    });
  }
  return lines;
}

export async function createEntry(
  _prev: CreateEntryState,
  formData: FormData,
): Promise<CreateEntryState> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const entryDate = String(formData.get("entryDate") ?? "");
  const description = String(formData.get("description") ?? "");
  const reference = String(formData.get("reference") ?? "");
  const sourceRaw = String(formData.get("source") ?? "manual");
  const fiscalPeriodId = String(formData.get("fiscalPeriodId") ?? "");
  const firmEntityId = String(formData.get("firmEntityId") ?? "");
  const periodOverrideReason = String(
    formData.get("periodOverrideReason") ?? "",
  ).trim();
  const action = String(formData.get("action") ?? "draft");
  const bypassControlWarning =
    String(formData.get("bypassControlWarning") ?? "") === "1";
  const isTemplate = action === "template";

  const validSources = ["manual", "invoice", "bill", "reconciliation"] as const;
  const source = (validSources as readonly string[]).includes(sourceRaw)
    ? (sourceRaw as (typeof validSources)[number])
    : "manual";

  let recurringFrequency: RecurringFrequency | null = null;
  let recurringDayOfMonth: number | null = null;
  let recurringStartDate: string | null = null;
  let recurringEndDate: string | null = null;
  if (isTemplate) {
    const freqRaw = String(formData.get("recurringFrequency") ?? "monthly");
    if (!(VALID_FREQUENCIES as readonly string[]).includes(freqRaw)) {
      return { error: "Invalid recurring frequency." };
    }
    recurringFrequency = freqRaw as RecurringFrequency;
    const dayRaw = String(formData.get("recurringDayOfMonth") ?? "").trim();
    const dayParsed = dayRaw === "" ? NaN : Number(dayRaw);
    if (!Number.isFinite(dayParsed) || dayParsed < 1 || dayParsed > 28) {
      return { error: "Day of month must be between 1 and 28." };
    }
    recurringDayOfMonth = Math.floor(dayParsed);
    recurringStartDate = String(formData.get("recurringNextDate") ?? "").trim();
    if (!recurringStartDate) {
      return { error: "Start date is required for a recurring template." };
    }
    const endRaw = String(formData.get("recurringEndDate") ?? "").trim();
    recurringEndDate = endRaw === "" ? null : endRaw;
  }

  const allLines = parseLines(formData);
  const lines = allLines.filter(
    (l) => !(l.debit === 0 && l.credit === 0 && !l.accountId),
  );

  if (!entryDate) {
    return { error: "Entry date is required." };
  }
  if (!description.trim()) {
    return { error: "Description is required." };
  }

  const status: "draft" | "posted" | "template" = isTemplate
    ? "template"
    : action === "post"
      ? "posted"
      : "draft";

  try {
    const created = await createJournalEntry(user, {
      entryDate,
      description: description.trim(),
      reference: reference.trim() === "" ? null : reference.trim(),
      source,
      fiscalPeriodId: fiscalPeriodId === "" ? null : fiscalPeriodId,
      firmEntityId: firmEntityId === "" ? null : firmEntityId,
      status,
      bypassControlWarning,
      periodOverrideReason:
        periodOverrideReason === "" ? null : periodOverrideReason,
      isTemplate,
      recurringFrequency,
      recurringDayOfMonth,
      recurringNextDate: recurringStartDate,
      recurringEndDate,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        description: l.description.trim() === "" ? null : l.description.trim(),
        debit: l.debit,
        credit: l.credit,
        dimensions: l.dimensions,
        intercompanyCounterpartEntityId: l.intercompanyCounterpartEntityId,
      })),
    });
    revalidatePath("/journal");
    if (isTemplate) {
      redirect("/journal?view=templates");
    }
    redirect(`/journal/${created.entryNumber}`);
  } catch (err) {
    // redirect() throws — let it propagate
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // next/navigation redirect throws a special object whose digest starts with NEXT_REDIRECT.
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    const raw =
      err instanceof Error ? err.message : "Failed to create entry.";
    return { error: stripPeriodErrorPrefix(raw) };
  }
}
