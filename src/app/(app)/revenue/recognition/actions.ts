"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { recognizeRevenue } from "@/lib/mutations";
import { PermissionError, requirePermission } from "@/lib/permissions";
import { stripPeriodErrorPrefix } from "@/lib/periods";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function recognizeRevenueAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  try {
    requirePermission(user, "close.task");
  } catch (err) {
    if (err instanceof PermissionError) {
      redirect(
        "/revenue/recognition?error=" +
          encodeURIComponent("You don't have permission to run recognition."),
      );
    }
    throw err;
  }
  const through = String(formData.get("throughDate") ?? "").trim();
  if (!through) {
    redirect(
      "/revenue/recognition?error=" +
        encodeURIComponent("A through-date is required."),
    );
  }
  let posted = 0;
  try {
    const res = await recognizeRevenue(user, through);
    posted = res.postedMonths;
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Recognition failed.";
    redirect(
      "/revenue/recognition?error=" +
        encodeURIComponent(stripPeriodErrorPrefix(msg)),
    );
  }
  revalidatePath("/revenue/recognition");
  revalidatePath("/journal");
  redirect(`/revenue/recognition?recognized=${posted}`);
}
