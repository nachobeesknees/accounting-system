"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { deleteTimeEntry, updateTimeEntry } from "@/lib/mutations";
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

export async function updateTimeEntryAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/time");

  const entryDate = String(formData.get("entryDate") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const duration = parseAmount(String(formData.get("durationHours") ?? ""));
  const description = String(formData.get("description") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const taskType = String(formData.get("taskType") ?? "").trim();
  const isBillable = formData.get("isBillable") === "on";
  const rateRaw = String(formData.get("rateAtLog") ?? "").trim();

  try {
    await updateTimeEntry(user, id, {
      userId: userId || undefined,
      entryDate: entryDate || undefined,
      durationHours: duration > 0 ? duration : undefined,
      description: description || undefined,
      clientId: clientId || null,
      entityId: entityId || null,
      taskType: taskType || null,
      isBillable,
      rateAtLog: rateRaw === "" ? null : parseAmount(rateRaw),
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect(`/time/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/time");
  revalidatePath("/time/report");
  redirect(`/time/${id}?saved=1`);
}

export async function deleteTimeEntryAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/time");
  try {
    await deleteTimeEntry(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
  }
  revalidatePath("/time");
  revalidatePath("/time/report");
  redirect("/time");
}
