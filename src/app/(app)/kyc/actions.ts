"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import { logKycReview, updateKycProfile } from "@/lib/mutations";
import { isKycOutcome, isKycStatus, isRiskRating } from "@/lib/compliance";
import type { KycSubjectType } from "@/lib/types";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function subjectTypeOf(formData: FormData): KycSubjectType {
  return String(formData.get("subjectType")) === "entity" ? "entity" : "customer";
}

function returnPath(formData: FormData): string {
  const raw = String(formData.get("returnTo") ?? "").trim();
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/kyc";
}

function revalidateKycSurfaces(subjectType: KycSubjectType, subjectId: string) {
  revalidatePath("/kyc");
  if (subjectType === "customer") {
    revalidatePath("/customers");
    revalidatePath(`/customers/${subjectId}`);
  } else {
    revalidatePath("/entities");
    revalidatePath(`/entities/${subjectId}`);
  }
}

/** Save the KYC / due-diligence profile fields on a client or entity. */
export async function updateKycProfileAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const subjectType = subjectTypeOf(formData);
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const dest = returnPath(formData);
  if (!subjectId) redirect(dest);

  const kycStatusRaw = String(formData.get("kycStatus") ?? "").trim();
  const riskRatingRaw = String(formData.get("riskRating") ?? "").trim();
  const pepFlag = formData.get("pepFlag") === "on";
  const sanctionsCheckedAt = String(formData.get("sanctionsCheckedAt") ?? "").trim();
  const kycNextReviewDate = String(formData.get("kycNextReviewDate") ?? "").trim();
  const kycNotes = String(formData.get("kycNotes") ?? "").trim();

  try {
    await updateKycProfile(user, subjectType, subjectId, {
      kycStatus: isKycStatus(kycStatusRaw) ? kycStatusRaw : undefined,
      riskRating: isRiskRating(riskRatingRaw) ? riskRatingRaw : null,
      pepFlag,
      sanctionsCheckedAt: sanctionsCheckedAt || null,
      kycNextReviewDate: kycNextReviewDate || null,
      kycNotes: kycNotes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to update KYC profile.";
    redirect(`${dest}${dest.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
  }
  revalidateKycSurfaces(subjectType, subjectId);
  redirect(`${dest}${dest.includes("?") ? "&" : "?"}saved=1`);
}

/**
 * Record a periodic due-diligence review. The mutation rolls the subject
 * forward (verified on cleared, next-review-date by risk cadence, risk
 * sync) — see logKycReview.
 */
export async function logKycReviewAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const subjectType = subjectTypeOf(formData);
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const dest = returnPath(formData);
  if (!subjectId) redirect(dest);

  const reviewDate = String(formData.get("reviewDate") ?? "").trim();
  const outcomeRaw = String(formData.get("outcome") ?? "").trim();
  const riskRatingAfterRaw = String(formData.get("riskRatingAfter") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!reviewDate || !isKycOutcome(outcomeRaw)) {
    redirect(
      `${dest}${dest.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        "Review date and outcome are required.",
      )}`,
    );
  }

  try {
    await logKycReview(user, {
      subjectType,
      subjectId,
      reviewDate,
      outcome: outcomeRaw,
      riskRatingAfter: isRiskRating(riskRatingAfterRaw) ? riskRatingAfterRaw : null,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Failed to log review.";
    redirect(`${dest}${dest.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
  }
  revalidateKycSurfaces(subjectType, subjectId);
  redirect(`${dest}${dest.includes("?") ? "&" : "?"}saved=1`);
}
