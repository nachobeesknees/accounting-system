"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import {
  createEntityFiling,
  deleteEntityFiling,
  markFilingFiled,
  updateEntityFiling,
  waiveEntityFiling,
} from "@/lib/mutations";
import { isFilingKind, isFilingRecurrence } from "@/lib/compliance";
import type { FilingStatus } from "@/lib/types";

const VALID_STATUSES: FilingStatus[] = ["pending", "in_progress", "filed", "waived"];

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/** Where to land after the action. Defaults to the filings calendar. */
function returnPath(formData: FormData): string {
  const raw = String(formData.get("returnTo") ?? "").trim();
  // Only allow same-app relative paths.
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/filings";
}

function revalidateFilingSurfaces(entityId?: string | null) {
  revalidatePath("/filings");
  revalidatePath("/");
  if (entityId) revalidatePath(`/entities/${entityId}`);
}

export async function createFilingAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const dest = returnPath(formData);

  const entityId = String(formData.get("entityId") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const recurrenceRaw = String(formData.get("recurrence") ?? "none").trim();
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!entityId || !title || !dueDate || !isFilingKind(kindRaw)) {
    redirect(
      `/filings/new?error=${encodeURIComponent(
        "Entity, kind, title, and due date are required.",
      )}`,
    );
  }

  try {
    await createEntityFiling(user, {
      entityId,
      kind: kindRaw,
      title,
      jurisdiction: jurisdiction || null,
      dueDate,
      recurrence: isFilingRecurrence(recurrenceRaw) ? recurrenceRaw : "none",
      ownerUserId: ownerUserId || null,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to create filing.";
    redirect(`/filings/new?error=${encodeURIComponent(msg)}`);
  }
  revalidateFilingSurfaces(entityId);
  redirect(`${dest}${dest.includes("?") ? "&" : "?"}saved=1`);
}

export async function updateFilingAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/filings");
  const dest = returnPath(formData);

  const entityId = String(formData.get("entityId") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const recurrenceRaw = String(formData.get("recurrence") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();
  const ownerUserId = String(formData.get("ownerUserId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    await updateEntityFiling(user, id, {
      entityId: entityId || undefined,
      kind: isFilingKind(kindRaw) ? kindRaw : undefined,
      title: title || undefined,
      jurisdiction: jurisdiction || null,
      dueDate: dueDate || undefined,
      recurrence: isFilingRecurrence(recurrenceRaw) ? recurrenceRaw : undefined,
      status: (VALID_STATUSES as readonly string[]).includes(statusRaw)
        ? (statusRaw as FilingStatus)
        : undefined,
      ownerUserId: ownerUserId || null,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to update filing.";
    redirect(`/filings/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidateFilingSurfaces(entityId || null);
  revalidatePath(`/filings/${id}`);
  redirect(`${dest}${dest.includes("?") ? "&" : "?"}saved=1`);
}

export async function markFilingFiledAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const entityId = String(formData.get("entityId") ?? "").trim();
  if (!id) redirect("/filings");
  const dest = returnPath(formData);

  try {
    await markFilingFiled(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to mark filed.";
    redirect(`${dest}${dest.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
  }
  revalidateFilingSurfaces(entityId || null);
  redirect(`${dest}${dest.includes("?") ? "&" : "?"}saved=1`);
}

export async function waiveFilingAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const entityId = String(formData.get("entityId") ?? "").trim();
  if (!id) redirect("/filings");
  const dest = returnPath(formData);

  try {
    await waiveEntityFiling(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to waive filing.";
    redirect(`${dest}${dest.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
  }
  revalidateFilingSurfaces(entityId || null);
  redirect(`${dest}${dest.includes("?") ? "&" : "?"}saved=1`);
}

export async function deleteFilingAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const entityId = String(formData.get("entityId") ?? "").trim();
  if (!id) redirect("/filings");
  const dest = returnPath(formData);

  try {
    await deleteEntityFiling(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to delete filing.";
    redirect(`${dest}${dest.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
  }
  revalidateFilingSurfaces(entityId || null);
  redirect(dest);
}
