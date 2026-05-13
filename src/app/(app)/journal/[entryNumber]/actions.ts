"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { getJournalEntryById } from "@/lib/data";
import { postJournalEntry, voidJournalEntry } from "@/lib/mutations";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export async function postEntry(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const entryId = String(formData.get("entryId") ?? "");
  if (!entryId) redirect("/journal");

  const before = await getJournalEntryById(entryId);
  const beforeTarget = before ? `/journal/${before.entryNumber}` : "/journal";

  try {
    await postJournalEntry(user, entryId);
  } catch (err) {
    if (isRedirect(err)) throw err;
    revalidatePath(beforeTarget);
    redirect(`${beforeTarget}?error=${encodeURIComponent(errorMessage(err))}`);
  }

  const entry = await getJournalEntryById(entryId);
  const target = entry ? `/journal/${entry.entryNumber}` : "/journal";
  revalidatePath("/journal");
  revalidatePath(target);
  redirect(target);
}

export async function voidEntry(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const entryId = String(formData.get("entryId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!entryId) redirect("/journal");

  const before = await getJournalEntryById(entryId);
  const beforeTarget = before ? `/journal/${before.entryNumber}` : "/journal";

  try {
    await voidJournalEntry(user, entryId, reason);
  } catch (err) {
    if (isRedirect(err)) throw err;
    revalidatePath(beforeTarget);
    redirect(`${beforeTarget}?error=${encodeURIComponent(errorMessage(err))}`);
  }

  const entry = await getJournalEntryById(entryId);
  const target = entry ? `/journal/${entry.entryNumber}` : "/journal";
  revalidatePath("/journal");
  revalidatePath(target);
  redirect(target);
}
