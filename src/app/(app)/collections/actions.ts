"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  logCollectionActivity,
  updateCollectionActivityStatus,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import { PermissionError, requirePermission } from "@/lib/permissions";
import type { CollectionActivityKind } from "@/lib/types";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

const VALID_KINDS: readonly CollectionActivityKind[] = [
  "note",
  "call",
  "email",
  "promise",
  "reminder",
];

async function guard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    requirePermission(user, "bank.create_transaction");
  } catch (err) {
    if (err instanceof PermissionError) {
      redirect(
        "/collections?error=" +
          encodeURIComponent("You don't have permission to log collections."),
      );
    }
    throw err;
  }
  return user;
}

export async function logCollectionActivityAction(
  formData: FormData,
): Promise<void> {
  const user = await guard();
  const customerId = String(formData.get("customerId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "note");
  const kind = (VALID_KINDS.includes(kindRaw as CollectionActivityKind)
    ? kindRaw
    : "note") as CollectionActivityKind;
  const notes = String(formData.get("notes") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = amountRaw === "" ? null : parseAmount(amountRaw);
  const promiseDateRaw = String(formData.get("promiseDate") ?? "").trim();
  const promiseDate = promiseDateRaw === "" ? null : promiseDateRaw;
  // Where to return afterwards — client page or collections worklist.
  const returnTo = String(formData.get("returnTo") ?? "/collections");
  if (!customerId) {
    redirect(`${returnTo}?error=${encodeURIComponent("Missing client id.")}`);
  }
  try {
    await logCollectionActivity(user, {
      customerId,
      kind,
      amount,
      promiseDate,
      status: kind === "promise" ? "open" : "done",
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to log activity.";
    redirect(`${returnTo}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/collections");
  revalidatePath(`/customers/${customerId}`);
  redirect(`${returnTo}?logged=1`);
}

export async function updateCollectionStatusAction(
  formData: FormData,
): Promise<void> {
  const user = await guard();
  const id = String(formData.get("id") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const status = (["open", "kept", "broken", "done"].includes(statusRaw)
    ? statusRaw
    : "done") as "open" | "kept" | "broken" | "done";
  const returnTo = String(formData.get("returnTo") ?? "/collections");
  try {
    await updateCollectionActivityStatus(user, id, status);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/collections");
  redirect(`${returnTo}?logged=1`);
}
