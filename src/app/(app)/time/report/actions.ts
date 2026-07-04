"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { invoiceOverageForFee } from "@/lib/mutations";
import { PermissionError, requirePermission } from "@/lib/permissions";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function invoiceOverageAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const entityFeeId = String(formData.get("entityFeeId") ?? "");
  const year = String(formData.get("year") ?? "");
  const returnTo = year ? `/time/report?year=${year}` : "/time/report";
  try {
    requirePermission(user, "invoice.create");
  } catch (err) {
    if (err instanceof PermissionError) {
      redirect(
        `${returnTo}&error=${encodeURIComponent("You don't have permission to invoice overage.")}`,
      );
    }
    throw err;
  }
  if (!entityFeeId) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("Missing fee id.")}`);
  }
  let invoiceId = "";
  try {
    const res = await invoiceOverageForFee(user, { entityFeeId });
    invoiceId = res.id;
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to invoice overage.";
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`,
    );
  }
  revalidatePath("/invoices");
  revalidatePath("/time");
  redirect(`/invoices/${invoiceId}?created=overage`);
}
