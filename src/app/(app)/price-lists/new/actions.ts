"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createPriceList } from "@/lib/mutations";

export type CreatePriceListState = { error: string | null };

export async function createPriceListAction(
  _prev: CreatePriceListState,
  formData: FormData,
): Promise<CreatePriceListState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const officeId = String(formData.get("officeId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  const versionStr = String(formData.get("versionNumber") ?? "1").trim();
  const isCurrent = formData.get("isCurrent") === "on";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!officeId) return { error: "Office is required." };
  if (!name) return { error: "Name is required." };
  if (!effectiveDate) return { error: "Effective date is required." };

  try {
    const created = await createPriceList(user, {
      officeId,
      name,
      versionNumber: parseInt(versionStr, 10) || 1,
      effectiveDate,
      isCurrent,
      notes: notes || null,
    });
    revalidatePath("/price-lists");
    redirect(`/price-lists/${created.id}`);
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "Failed to create price list." };
  }
}
