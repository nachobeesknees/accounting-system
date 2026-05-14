"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createOffice } from "@/lib/mutations";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function createOfficeAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const currencyCode = String(formData.get("currencyCode") ?? "USD").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const regionIdRaw = String(formData.get("regionId") ?? "").trim();
  const regionId = regionIdRaw === "" ? null : regionIdRaw;

  if (!code || !name) {
    redirect("/offices?error=" + encodeURIComponent("Code and name are required."));
  }

  try {
    await createOffice(user, {
      code,
      name,
      address: address || null,
      currencyCode: currencyCode || "USD",
      notes: notes || null,
      regionId,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Create failed";
    redirect("/offices?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/offices");
  redirect("/offices?saved=1");
}
