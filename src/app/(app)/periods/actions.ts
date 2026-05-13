"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { setPeriodStatus } from "@/lib/mutations";

export async function togglePeriod(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const periodId = String(formData.get("periodId"));
  const status =
    formData.get("status") === "closed" ? "open" : "closed";
  await setPeriodStatus(user, periodId, status);
  revalidatePath("/periods");
  redirect("/periods");
}
