"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { saveDashboardPrefs } from "@/lib/mutations";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard-widgets";

/** Persist the caller's dashboard widget visibility. The form submits one
 *  checkbox per VISIBLE widget; anything unchecked becomes hidden. */
export async function saveDashboardPrefsAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const visible = new Set(
    formData.getAll("visible").filter((v): v is string => typeof v === "string"),
  );
  const hidden = DASHBOARD_WIDGETS.map((w) => w.key).filter(
    (k) => !visible.has(k),
  );
  await saveDashboardPrefs(user, hidden);
  revalidatePath("/");
  redirect("/");
}
