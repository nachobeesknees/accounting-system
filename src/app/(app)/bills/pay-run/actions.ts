"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { preparePaymentRun } from "@/lib/mutations";
import { getSessionUser } from "@/lib/session";
import { PermissionError } from "@/lib/permissions";

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Dual-control step 1: PREPARE a payment run from the selected bills.
 *
 * No money moves and no journal entries post here — the run is staged as
 * pending_release (payment_runs + payment_run_items) and a DIFFERENT user
 * with payment.release executes it from /payments/runs/[id].
 */
export async function preparePaymentRunAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const billIds = formData
    .getAll("billIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const paymentDate = String(formData.get("paymentDate") ?? "").trim();
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();

  if (billIds.length === 0) {
    redirect(
      `/bills/pay-run?error=${encodeURIComponent("Pick at least one bill to pay.")}`,
    );
  }
  if (!bankAccountId) {
    redirect(
      `/bills/pay-run?error=${encodeURIComponent("Pick the funding bank account.")}`,
    );
  }

  let runId = "";
  try {
    const run = await preparePaymentRun(user, {
      billIds,
      bankAccountId,
      requestedPaymentDate: paymentDate || null,
    });
    runId = run.id;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const msg =
      err instanceof PermissionError
        ? "You don't have permission to prepare payment runs."
        : err instanceof Error
          ? err.message
          : "Failed to prepare the payment run.";
    redirect(`/bills/pay-run?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/bills/pay-run");
  revalidatePath("/payments/runs");
  redirect(`/payments/runs/${runId}`);
}
