"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { generateIntercompanyElimination } from "@/lib/mutations";

/**
 * Server action: produce an elimination JE for the (entityA, entityB) pair.
 * The form on /reports/intercompany posts two firm-entity ids; we pop the
 * resulting JE detail page on success.
 */
export async function generateEliminationAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

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
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    const message =
      err instanceof Error ? err.message : "Failed to generate elimination.";
    redirect(
      `/reports/intercompany?error=${encodeURIComponent(message)}`,
    );
  }
}
