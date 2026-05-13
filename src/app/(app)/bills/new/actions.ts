"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import {
  approveBill,
  createBill,
  type DraftBillLine,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

export type CreateBillState = { error: string | null };

type ParsedLine = {
  description: string;
  accountId: string;
  quantity: number;
  unitPrice: number;
};

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
  const notes = String(formData.get("notes") ?? "").trim();
  const action = String(formData.get("action") ?? "draft");

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
    }));

  if (lines.length === 0) {
    return { error: "Bill must have at least one line." };
  }

  try {
    const created = await createBill(user, {
      vendorId,
      billDate,
      dueDate,
      reference: reference === "" ? null : reference,
      notes: notes === "" ? null : notes,
      lines,
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
