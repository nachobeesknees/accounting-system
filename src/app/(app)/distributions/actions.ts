"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import {
  approveDistribution,
  createDistribution,
  markDistributionPaid,
  rejectDistribution,
} from "@/lib/mutations";
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

function revalidateDistributionSurfaces(id?: string, entityId?: string | null) {
  revalidatePath("/distributions");
  if (id) revalidatePath(`/distributions/${id}`);
  if (entityId) revalidatePath(`/entities/${entityId}`);
}

export async function createDistributionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const entityId = String(formData.get("entityId") ?? "").trim();
  const beneficiaryContactId = String(formData.get("beneficiaryContactId") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currencyCode = String(formData.get("currencyCode") ?? "").trim().toUpperCase();
  const bankAccountId = String(formData.get("bankAccountId") ?? "").trim();
  const resolutionReference = String(formData.get("resolutionReference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const amount = parseAmount(amountRaw);
  if (!entityId || !beneficiaryContactId || !(amount > 0)) {
    redirect(
      `/distributions/new?entity=${encodeURIComponent(entityId)}&error=${encodeURIComponent(
        "Entity, beneficiary, and a positive amount are required.",
      )}`,
    );
  }

  let createdId: string;
  try {
    const created = await createDistribution(user, {
      entityId,
      beneficiaryContactId,
      amount,
      currencyCode: currencyCode || undefined,
      bankAccountId: bankAccountId || null,
      resolutionReference: resolutionReference || null,
      notes: notes || null,
    });
    createdId = created.id;
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to create distribution.";
    redirect(
      `/distributions/new?entity=${encodeURIComponent(entityId)}&error=${encodeURIComponent(msg)}`,
    );
  }
  revalidateDistributionSurfaces(createdId, entityId);
  redirect(`/distributions/${createdId}?saved=1`);
}

export async function approveDistributionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const entityId = String(formData.get("entityId") ?? "").trim();
  if (!id) redirect("/distributions");

  try {
    await approveDistribution(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Approval failed.";
    redirect(`/distributions/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidateDistributionSurfaces(id, entityId || null);
  redirect(`/distributions/${id}?saved=1`);
}

export async function rejectDistributionAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const entityId = String(formData.get("entityId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) redirect("/distributions");
  if (!reason) {
    redirect(
      `/distributions/${id}?error=${encodeURIComponent("A rejection reason is required.")}`,
    );
  }

  try {
    await rejectDistribution(user, id, reason);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Rejection failed.";
    redirect(`/distributions/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidateDistributionSurfaces(id, entityId || null);
  redirect(`/distributions/${id}?saved=1`);
}

export async function markDistributionPaidAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "").trim();
  const entityId = String(formData.get("entityId") ?? "").trim();
  if (!id) redirect("/distributions");

  try {
    await markDistributionPaid(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Mark-paid failed.";
    redirect(`/distributions/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidateDistributionSurfaces(id, entityId || null);
  revalidatePath("/journal");
  revalidatePath("/bank");
  redirect(`/distributions/${id}?saved=1`);
}
