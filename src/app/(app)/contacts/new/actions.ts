"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createContact } from "@/lib/mutations";

export type CreateContactState = { error: string | null };

export async function createContactAction(
  _prev: CreateContactState,
  formData: FormData,
): Promise<CreateContactState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "organization") as
    | "individual"
    | "organization";
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const isClient = formData.get("isClient") === "on";
  const isVendor = formData.get("isVendor") === "on";
  const isEmployee = formData.get("isEmployee") === "on";
  const isIntermediary = formData.get("isIntermediary") === "on";

  if (!code) return { error: "Code is required." };
  if (!name) return { error: "Name is required." };

  try {
    const created = await createContact(user, {
      code,
      name,
      kind,
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      isClient,
      isVendor,
      isEmployee,
      isIntermediary,
    });
    revalidatePath("/contacts");
    redirect(`/contacts/${created.id}`);
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
    return { error: err instanceof Error ? err.message : "Failed to create contact." };
  }
}
