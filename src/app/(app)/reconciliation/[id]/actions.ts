"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import {
  acceptReconciliationMatch,
  completeReconciliationSession,
  setReconciliationCleared,
  voidReconciliationSession,
} from "@/lib/mutations";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function back(sessionId: string, error?: string): never {
  redirect(
    error
      ? `/reconciliation/${sessionId}?error=${encodeURIComponent(error)}`
      : `/reconciliation/${sessionId}`,
  );
}

function refresh(sessionId: string) {
  revalidatePath("/reconciliation");
  revalidatePath(`/reconciliation/${sessionId}`);
}

/** Clear / unclear one transaction. `cleared` carries the TARGET state. */
export async function toggleClearedAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  const cleared = String(formData.get("cleared") ?? "") === "1";
  if (!sessionId || !transactionId) redirect("/reconciliation");

  try {
    await setReconciliationCleared(user, { sessionId, transactionId, cleared });
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(sessionId, err instanceof Error ? err.message : "Update failed.");
  }
  refresh(sessionId);
  back(sessionId);
}

/** Accept an auto-match: stamp the JE and clear the transaction. */
export async function acceptMatchAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  const journalEntryId = String(formData.get("journalEntryId") ?? "");
  if (!sessionId || !transactionId || !journalEntryId) redirect("/reconciliation");

  try {
    await acceptReconciliationMatch(user, { sessionId, transactionId, journalEntryId });
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(sessionId, err instanceof Error ? err.message : "Match failed.");
  }
  refresh(sessionId);
  back(sessionId);
}

export async function completeSessionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) redirect("/reconciliation");

  try {
    await completeReconciliationSession(user, sessionId);
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(sessionId, err instanceof Error ? err.message : "Could not complete the session.");
  }
  refresh(sessionId);
  back(sessionId);
}

export async function voidSessionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) redirect("/reconciliation");

  try {
    await voidReconciliationSession(user, sessionId);
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(sessionId, err instanceof Error ? err.message : "Could not void the session.");
  }
  refresh(sessionId);
  redirect("/reconciliation");
}
