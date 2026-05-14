"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import {
  approveBill,
  createBill,
  type CreateBillInput,
  type DraftBillLine,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

type ChargebackType = "cost" | "markup" | "fixed" | "included";

function parseChargebackType(raw: string): ChargebackType | null {
  if (raw === "cost" || raw === "markup" || raw === "fixed" || raw === "included") {
    return raw;
  }
  return null;
}

export type CreateBillState = { error: string | null };

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

export async function createBillAction(
  _prev: CreateBillState,
  formData: FormData,
): Promise<CreateBillState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const vendorId = String(formData.get("vendorId") ?? "");
  const billDate = String(formData.get("billDate") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const vendorInvoiceNumber = String(
    formData.get("vendorInvoiceNumber") ?? "",
  ).trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const action = String(formData.get("action") ?? "draft");
  const clientIdRaw = String(formData.get("clientId") ?? "").trim();
  const entityIdRaw = String(formData.get("entityId") ?? "").trim();

  if (!vendorId) return { error: "Vendor is required." };
  if (!billDate) return { error: "Bill date is required." };
  if (!dueDate) return { error: "Due date is required." };

  const rawLines = parseLines(formData);
  const lines: DraftBillLine[] = rawLines
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
    return { error: "Bill must have at least one line." };
  }

  // Chargeback fields — recipient ("none" | "client" | "entity") + method.
  const recipient = String(formData.get("chargebackRecipient") ?? "none");
  const chargebackTypeRaw = String(formData.get("chargebackType") ?? "");
  const chargebackType = parseChargebackType(chargebackTypeRaw);
  const chargebackClientId = String(formData.get("chargebackClientId") ?? "").trim();
  const chargebackEntityId = String(formData.get("chargebackEntityId") ?? "").trim();
  const markupPctRaw = String(formData.get("markupPct") ?? "").trim();
  const rebillAmountRaw = String(formData.get("rebillAmount") ?? "").trim();
  const chargebackNotes = String(formData.get("chargebackNotes") ?? "").trim();

  const chargeback: Partial<CreateBillInput> = {};
  if (recipient !== "none" && chargebackType) {
    if (recipient === "client") {
      if (!chargebackClientId) {
        return { error: "Pick a client to rebill to." };
      }
      chargeback.chargebackClientId = chargebackClientId;
      chargeback.chargebackEntityId = null;
    } else if (recipient === "entity") {
      if (!chargebackEntityId) {
        return { error: "Pick an entity to rebill to." };
      }
      chargeback.chargebackEntityId = chargebackEntityId;
      chargeback.chargebackClientId = null;
    }
    chargeback.chargebackType = chargebackType;
    if (chargebackType === "markup") {
      const pct = parseAmount(markupPctRaw);
      if (!Number.isFinite(pct) || pct < 0) {
        return { error: "Markup % must be a positive number." };
      }
      // Input is a percent (e.g. 15) — store as decimal (0.15).
      chargeback.markupPct = pct / 100;
    }
    if (chargebackType === "fixed") {
      const amt = parseAmount(rebillAmountRaw);
      if (!Number.isFinite(amt) || amt <= 0) {
        return { error: "Fixed rebill amount must be > 0." };
      }
      chargeback.rebillAmount = amt;
    }
    if (chargebackNotes !== "") {
      chargeback.chargebackNotes = chargebackNotes;
    }
  }

  try {
    const created = await createBill(user, {
      vendorId,
      billDate,
      dueDate,
      reference: reference === "" ? null : reference,
      vendorInvoiceNumber:
        vendorInvoiceNumber === "" ? null : vendorInvoiceNumber,
      notes: notes === "" ? null : notes,
      clientId: clientIdRaw === "" ? null : clientIdRaw,
      entityId: entityIdRaw === "" ? null : entityIdRaw,
      lines,
      ...chargeback,
    });

    if (action === "approve") {
      await approveBill(user, created.id);
    }

    revalidatePath("/bills");
    revalidatePath("/");
    revalidatePath("/journal");
    redirect(`/bills/${created.id}`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return {
      error: err instanceof Error ? err.message : "Failed to create bill.",
    };
  }
}
