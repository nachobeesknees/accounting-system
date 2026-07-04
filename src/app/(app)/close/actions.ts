"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";
import { setPeriodCloseTaskStatus } from "@/lib/mutations";
import { PermissionError, requirePermission } from "@/lib/permissions";

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
  return err instanceof Error ? err.message : "Unknown error";
}

function back(qs?: string): never {
  redirect(`/close${qs ? `?error=${encodeURIComponent(qs)}` : ""}`);
}

export async function setCloseTaskAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const taskId = String(formData.get("taskId") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const status =
    statusRaw === "done" || statusRaw === "na" || statusRaw === "open"
      ? statusRaw
      : null;
  try {
    requirePermission(user, "close.task");
    if (!taskId || !status) throw new Error("Missing task or status.");
    await setPeriodCloseTaskStatus(user, taskId, status);
  } catch (err) {
    if (isRedirect(err)) throw err;
    if (err instanceof PermissionError) {
      back("You don't have permission to update checklist tasks.");
    }
    back(errorMessage(err));
  }
  revalidatePath("/close");
  back();
}
