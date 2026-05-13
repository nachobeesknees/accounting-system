"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createFeeSchedule } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";
import type { EntityKind } from "@/lib/types";

const VALID_KINDS: EntityKind[] = [
  "llc",
  "trust",
  "scorp",
  "ccorp",
  "partnership",
  "foundation",
  "individual",
  "other",
];

export type CreateScheduleState = { error: string | null };

export async function createScheduleAction(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const entityKindRaw = String(formData.get("entityKind") ?? "");
  const annualFee = parseAmount(String(formData.get("annualFee") ?? ""));
  const includedHours = parseAmount(String(formData.get("includedHours") ?? ""));
  const yearStr = String(formData.get("applicableYear") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!(VALID_KINDS as readonly string[]).includes(entityKindRaw)) {
    return { error: "Invalid entity kind." };
  }
  if (annualFee < 0) return { error: "Annual fee must be ≥ 0." };
  if (includedHours < 0) return { error: "Included hours must be ≥ 0." };

  try {
    await createFeeSchedule(user, {
      name,
      entityKind: entityKindRaw as EntityKind,
      annualFee,
      includedHours,
      applicableYear: yearStr ? parseInt(yearStr, 10) : null,
      notes: notes || null,
    });
    revalidatePath("/fees");
    redirect("/fees?tab=schedules");
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "Failed to create schedule." };
  }
}
