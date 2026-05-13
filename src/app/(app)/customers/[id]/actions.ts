"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { setCustomerAssignedUser } from "@/lib/mutations";

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function setAssignedUserAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) {
    redirect(`/customers?error=${encodeURIComponent("Missing customer id.")}`);
  }
  const raw = String(formData.get("assignedUserId") ?? "");
  const assignedUserId = raw === "" ? null : raw;

  try {
    await setCustomerAssignedUser(user, customerId, assignedUserId);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : "Save failed.";
    redirect(
      `/customers/${customerId}?error=${encodeURIComponent(message)}`,
    );
  }

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?saved=1`);
}
