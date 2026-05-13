"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import {
  generateInvoiceFromEntityFees,
  type AddonCharge,
} from "@/lib/mutations";

export type GenerateState = { error?: string };

export async function generateInvoiceAction(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const customerId = String(formData.get("customerId") ?? "");
  const billingYear = parseInt(
    String(formData.get("billingYear") ?? "2026"),
    10,
  );
  const invoiceDate = String(formData.get("invoiceDate") ?? "") || undefined;
  const dueDate = String(formData.get("dueDate") ?? "") || undefined;
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const notes = notesRaw === "" ? null : notesRaw;
  const action = String(formData.get("action") ?? "submit"); // 'submit' | 'draft'

  if (!customerId) return { error: "Customer is required." };
  if (!Number.isFinite(billingYear)) {
    return { error: "Billing year must be a valid number." };
  }

  // Parse addons[<key>][label|unit_price|quantity|enabled]
  const seenKeys = new Set<string>();
  for (const k of formData.keys()) {
    const m = k.match(
      /^addons\[([^\]]+)\]\[(label|unit_price|quantity|enabled)\]$/,
    );
    if (!m) continue;
    seenKeys.add(m[1]);
  }
  const addons: AddonCharge[] = [];
  for (const key of seenKeys) {
    const enabled = formData.get(`addons[${key}][enabled]`);
    if (!enabled) continue;
    const label = String(formData.get(`addons[${key}][label]`) ?? key);
    const unitPrice = parseFloat(
      String(formData.get(`addons[${key}][unit_price]`) ?? "0"),
    );
    const quantity = parseFloat(
      String(formData.get(`addons[${key}][quantity]`) ?? "1"),
    );
    if (!Number.isFinite(unitPrice) || !Number.isFinite(quantity)) continue;
    if (quantity <= 0) continue;
    addons.push({ key, label, unitPrice, quantity });
  }

  let result: { id: string; invoiceNumber: string; lineCount: number };
  try {
    result = await generateInvoiceFromEntityFees(user, {
      customerId,
      billingYear,
      invoiceDate,
      dueDate,
      notes,
      addons,
      submitForApproval: action === "submit",
    });
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to generate invoice.",
    };
  }

  revalidatePath("/invoices");
  revalidatePath("/");
  if (action === "submit") revalidatePath("/journal");
  redirect(`/invoices/${result.id}?generated=1&lines=${result.lineCount}`);
}
