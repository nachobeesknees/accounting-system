"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import {
  draftIntercompanyCounterpart,
  generateIntercompanyElimination,
} from "@/lib/mutations";
import { PermissionError, requirePermission } from "@/lib/permissions";

function isNextRedirect(err: unknown): boolean {
  if (err instanceof Error && err.message === "NEXT_REDIRECT") return true;
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Server action: produce an elimination JE for the (entityA, entityB) pair.
 * The form on /reports/intercompany posts two firm-entity ids; we pop the
 * resulting JE detail page on success.
 */
export async function generateEliminationAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    requirePermission(user, "intercompany.generate_elimination");
  } catch (err) {
    if (err instanceof PermissionError) {
      redirect(
        `/reports/intercompany?error=${encodeURIComponent(
          "You don't have permission to generate eliminations.",
        )}`,
      );
    }
    throw err;
  }

  const entityAId = String(formData.get("entityAId") ?? "").trim();
  const entityBId = String(formData.get("entityBId") ?? "").trim();
  if (!entityAId || !entityBId) {
    redirect(
      `/reports/intercompany?error=${encodeURIComponent(
        "Pick two firm entities.",
      )}`,
    );
  }

  try {
    const created = await generateIntercompanyElimination(
      user,
      entityAId,
      entityBId,
    );
    revalidatePath("/reports/intercompany");
    revalidatePath("/journal");
    redirect(`/journal/${created.entryNumber}`);
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message =
      err instanceof Error ? err.message : "Failed to generate elimination.";
    redirect(
      `/reports/intercompany?error=${encodeURIComponent(message)}`,
    );
  }
}

/**
 * Server action: draft (never post) the missing counterpart JE for a
 * mismatched pair on the deficient entity's books. Redirects to the new
 * draft so the accountant can review accounts + amounts before posting.
 */
export async function draftCounterpartAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    requirePermission(user, "journal_entry.create");
  } catch (err) {
    if (err instanceof PermissionError) {
      redirect(
        `/reports/intercompany?error=${encodeURIComponent(
          "You don't have permission to create journal entries.",
        )}`,
      );
    }
    throw err;
  }

  const deficientEntityId = String(formData.get("deficientEntityId") ?? "").trim();
  const counterpartEntityId = String(
    formData.get("counterpartEntityId") ?? "",
  ).trim();
  if (!deficientEntityId || !counterpartEntityId) {
    redirect(
      `/reports/intercompany?error=${encodeURIComponent(
        "Pick two firm entities.",
      )}`,
    );
  }

  try {
    const created = await draftIntercompanyCounterpart(
      user,
      deficientEntityId,
      counterpartEntityId,
    );
    revalidatePath("/reports/intercompany");
    revalidatePath("/journal");
    redirect(`/journal/${created.entryNumber}`);
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message =
      err instanceof Error ? err.message : "Failed to draft counterpart entry.";
    redirect(`/reports/intercompany?error=${encodeURIComponent(message)}`);
  }
}
