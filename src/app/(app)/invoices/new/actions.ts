"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createInvoice, postInvoice, type DraftInvoiceLine } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

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

  const customerId = String(formData.get("customerId") ?? "");
  const invoiceDate = String(formData.get("invoiceDate") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const action = String(formData.get("action") ?? "draft");

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

  try {
    const created = await createInvoice(user, {
      customerId,
      invoiceDate,
      dueDate,
      notes: notes === "" ? null : notes,
      lines,
    });

    if (action === "post") {
      await postInvoice(user, created.id);
    }

    revalidatePath("/invoices");
    revalidatePath("/");
    revalidatePath("/journal");
    redirect(`/invoices/${created.id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error: err instanceof Error ? err.message : "Failed to create invoice.",
    };
  }
}
