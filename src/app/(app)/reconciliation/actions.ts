"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import { startReconciliationSession } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function startSessionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  const statementDate = String(formData.get("statementDate") ?? "").trim();
  const balanceRaw = String(formData.get("statementEndingBalance") ?? "").trim();

  if (!bankAccountId) {
    redirect(`/reconciliation?error=${encodeURIComponent("Pick a bank account.")}`);
  }
  if (!statementDate) {
    redirect(`/reconciliation?error=${encodeURIComponent("Statement date is required.")}`);
  }
  if (balanceRaw === "") {
    redirect(
      `/reconciliation?error=${encodeURIComponent("Statement ending balance is required.")}`,
    );
  }

  let sessionId = "";
  try {
    const created = await startReconciliationSession(user, {
      bankAccountId,
      statementDate,
      statementEndingBalance: parseAmount(balanceRaw),
    });
    sessionId = created.id;
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Could not start the session.";
    redirect(`/reconciliation?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/reconciliation");
  redirect(`/reconciliation/${sessionId}`);
}
