"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import { releasePaymentRun, voidPaymentRun } from "@/lib/mutations";
import { PermissionError } from "@/lib/permissions";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function refresh(runId: string) {
  revalidatePath("/payments/runs");
  revalidatePath(`/payments/runs/${runId}`);
  revalidatePath("/bills");
  revalidatePath("/bills/pay-run");
  revalidatePath("/cash-forecast");
  revalidatePath("/");
}

/**
 * Dual-control step 2: release the run. The mutation enforces both the
 * payment.release permission AND releaser ≠ preparer, and posts every
 * pending item through the shared bill-payment logic.
 */
export async function releaseRunAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const runId = String(formData.get("runId") ?? "");
  if (!runId) redirect("/payments/runs");

  try {
    await releasePaymentRun(user, runId);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg =
      err instanceof PermissionError
        ? "You don't have permission to release payments (requires payment.release)."
        : err instanceof Error
          ? err.message
          : "Release failed.";
    redirect(`/payments/runs/${runId}?error=${encodeURIComponent(msg)}`);
  }
  refresh(runId);
  redirect(`/payments/runs/${runId}?released=1`);
}

export async function voidRunAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const runId = String(formData.get("runId") ?? "");
  if (!runId) redirect("/payments/runs");

  try {
    await voidPaymentRun(user, runId);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Void failed.";
    redirect(`/payments/runs/${runId}?error=${encodeURIComponent(msg)}`);
  }
  refresh(runId);
  redirect(`/payments/runs/${runId}`);
}
