"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createTimeEntry } from "@/lib/mutations";
import { parseAmount } from "@/lib/money";

export type CreateTimeState = { error: string | null };

export async function createTimeEntryAction(
  _prev: CreateTimeState,
  formData: FormData,
): Promise<CreateTimeState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const entryDate = String(formData.get("entryDate") ?? "");
  const userId = String(formData.get("userId") ?? user.userId);
  const duration = parseAmount(String(formData.get("durationHours") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const taskType = String(formData.get("taskType") ?? "").trim();
  const isBillable = formData.get("isBillable") === "on";
  const rateRaw = String(formData.get("rateAtLog") ?? "").trim();

  if (!entryDate) return { error: "Date is required." };
  if (duration <= 0) return { error: "Duration must be > 0." };
  if (!description) return { error: "Description is required." };

  try {
    await createTimeEntry(user, {
      userId,
      entryDate,
      durationHours: duration,
      description,
      clientId: clientId || null,
      entityId: entityId || null,
      taskType: taskType || null,
      isBillable,
      rateAtLog: rateRaw ? parseAmount(rateRaw) : null,
    });
    revalidatePath("/time");
    revalidatePath("/time/report");
    redirect("/time");
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
    return { error: err instanceof Error ? err.message : "Failed to log time." };
  }
}
