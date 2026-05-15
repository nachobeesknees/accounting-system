"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUser } from "@/lib/session";
import { createInvoice, postInvoice, type DraftInvoiceLine } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import { stripPeriodErrorPrefix } from "@/lib/periods";
import { PermissionError, requirePermission } from "@/lib/permissions";
import type { InvoiceRecurringFrequency } from "@/lib/types";

const VALID_FREQUENCIES: readonly InvoiceRecurringFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annually",
];

export type CreateInvoiceState = { error: string | null };

type ParsedLine = {
  description: string;
  accountId: string;
  quantity: number;
  unitPrice: number;
  dimensions: Record<string, string>;
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
    const description = formData.get(`lines[${i}][description]`);
    const accountId = formData.get(`lines[${i}][accountId]`);
    const quantity = formData.get(`lines[${i}][quantity]`);
    const unitPrice = formData.get(`lines[${i}][unitPrice]`);

    if (
      description == null &&
      accountId == null &&
      quantity == null &&
      unitPrice == null
    ) {
      break;
    }

    lines.push({
      description: typeof description === "string" ? description : "",
      accountId: typeof accountId === "string" ? accountId : "",
      quantity: parseAmount(typeof quantity === "string" ? quantity : ""),
      unitPrice: parseAmount(typeof unitPrice === "string" ? unitPrice : ""),
      dimensions: parseDimensionsForLine(formData, i),
    });
  }
  return lines;
}

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function createInvoiceAction(
  _prev: CreateInvoiceState,
  formData: FormData,
): Promise<CreateInvoiceState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    requirePermission(user, "invoice.create");
  } catch (err) {
    if (err instanceof PermissionError) {
      return { error: "You don't have permission to create invoices." };
    }
    throw err;
  }

  const customerId = String(formData.get("customerId") ?? "");
  const invoiceDate = String(formData.get("invoiceDate") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const ocrText = String(formData.get("ocrText") ?? "").trim();
  const periodOverrideReason = String(
    formData.get("periodOverrideReason") ?? "",
  ).trim();
  const action = String(formData.get("action") ?? "draft");

  // Tax: rate comes in as a percent ("8.75"); convert to decimal.
  // Exempt is a checkbox, absent in FormData when unchecked.
  const taxRatePctRaw = String(formData.get("taxRatePct") ?? "").trim();
  const taxRatePct = taxRatePctRaw === "" ? 0 : parseFloat(taxRatePctRaw);
  const taxRate =
    Number.isFinite(taxRatePct) && taxRatePct > 0 ? taxRatePct / 100 : 0;
  const taxExempt = formData.get("taxExempt") === "on";

  // FX rate snapshot. Hidden when currency === base; arrives as ""/null
  // in that case. Negative/0/non-numeric → null so createInvoice's
  // serializeFxRate() coalesces back to NULL ("base currency").
  const fxRateRaw = String(formData.get("fxRate") ?? "").trim();
  const fxRateParsed = fxRateRaw === "" ? NaN : parseFloat(fxRateRaw);
  const fxRate: number | null =
    Number.isFinite(fxRateParsed) && fxRateParsed > 0 ? fxRateParsed : null;

  if (!customerId) return { error: "Customer is required." };
  if (!invoiceDate) return { error: "Invoice date is required." };
  if (!dueDate) return { error: "Due date is required." };

  const rawLines = parseLines(formData);
  const lines: DraftInvoiceLine[] = rawLines
    .filter(
      (l) =>
        l.description.trim() !== "" ||
        l.accountId !== "" ||
        l.quantity !== 0 ||
        l.unitPrice !== 0,
    )
    .map((l) => ({
      description: l.description.trim(),
      accountId: l.accountId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      dimensions: l.dimensions,
    }));

  if (lines.length === 0) {
    return { error: "Invoice must have at least one line." };
  }

  // Bills the user selected via the "Pending vendor chargebacks" widget.
  // Mark each as billed-back to this invoice so they don't get rebilled again.
  const chargebackBillIds = formData
    .getAll("chargebackBillIds[]")
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v !== "");

  // Time entries the user pulled in via the "Unbilled time entries" widget.
  const timeEntryIds = formData
    .getAll("timeEntryIds[]")
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v !== "");

  // Recurring template fields. Only parsed when the user clicked "Save
  // template" (action === "template"); otherwise we leave them null so a
  // regular draft/post-flow invoice doesn't accidentally get template data.
  const isTemplate = action === "template";
  let recurringFrequency: InvoiceRecurringFrequency | null = null;
  let recurringDayOfMonth: number | null = null;
  let recurringStartDate: string | null = null;
  let recurringEndDate: string | null = null;
  if (isTemplate) {
    const freqRaw = String(formData.get("recurringFrequency") ?? "monthly");
    if (!VALID_FREQUENCIES.includes(freqRaw as InvoiceRecurringFrequency)) {
      return { error: "Invalid recurring frequency." };
    }
    recurringFrequency = freqRaw as InvoiceRecurringFrequency;
    const needsDay =
      recurringFrequency === "monthly" ||
      recurringFrequency === "quarterly" ||
      recurringFrequency === "annually";
    if (needsDay) {
      const dayRaw = String(formData.get("recurringDayOfMonth") ?? "").trim();
      const dayParsed = parseFloat(dayRaw);
      if (!Number.isFinite(dayParsed) || dayParsed < 1 || dayParsed > 28) {
        return { error: "Day of month must be between 1 and 28." };
      }
      recurringDayOfMonth = Math.floor(dayParsed);
    }
    recurringStartDate = String(formData.get("recurringNextDate") ?? "").trim();
    if (!recurringStartDate) {
      return { error: "Start date is required for a recurring template." };
    }
    const endRaw = String(formData.get("recurringEndDate") ?? "").trim();
    recurringEndDate = endRaw === "" ? null : endRaw;
  }

  try {
    const created = await createInvoice(user, {
      customerId,
      invoiceDate,
      dueDate,
      notes: notes === "" ? null : notes,
      ocrText: ocrText === "" ? null : ocrText,
      periodOverrideReason:
        periodOverrideReason === "" ? null : periodOverrideReason,
      taxRate,
      taxExempt,
      fxRate,
      lines,
      isTemplate,
      recurringFrequency,
      recurringDayOfMonth,
      recurringNextDate: recurringStartDate,
      recurringEndDate,
      // Templates never bill time entries directly — they spawn drafts that
      // can; only attach time entries to non-template invoices.
      timeEntryIds: isTemplate ? undefined : timeEntryIds,
    });

    if (chargebackBillIds.length > 0 && !isTemplate) {
      const db = getDb();
      await db
        .update(schema.bills)
        .set({ chargebackInvoiceId: created.id, updatedAt: new Date() })
        .where(inArray(schema.bills.id, chargebackBillIds));
      revalidatePath("/bills");
    }

    if (action === "post") {
      await postInvoice(user, created.id, {
        periodOverrideReason:
          periodOverrideReason === "" ? null : periodOverrideReason,
      });
    }

    revalidatePath("/invoices");
    revalidatePath("/");
    revalidatePath("/journal");
    if (timeEntryIds.length > 0) revalidatePath("/time");
    redirect(`/invoices/${created.id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const raw =
      err instanceof Error ? err.message : "Failed to create invoice.";
    return { error: stripPeriodErrorPrefix(raw) };
  }
}
