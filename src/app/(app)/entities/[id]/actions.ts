"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { deleteEntity, updateEntity } from "@/lib/mutations";
import type { EntityKind, EntityStatus } from "@/lib/types";

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
const VALID_STATUSES: EntityStatus[] = ["active", "pending", "dormant", "dissolved"];

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function updateEntityAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/entities");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
  const formationDate = String(formData.get("formationDate") ?? "").trim();
  const ein = String(formData.get("ein") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    await updateEntity(user, id, {
      code: code || undefined,
      name: name || undefined,
      clientId: clientId || undefined,
      kind: (VALID_KINDS as readonly string[]).includes(kindRaw)
        ? (kindRaw as EntityKind)
        : undefined,
      status: (VALID_STATUSES as readonly string[]).includes(statusRaw)
        ? (statusRaw as EntityStatus)
        : undefined,
      jurisdiction: jurisdiction || null,
      formationDate: formationDate || null,
      ein: ein || null,
      notes: notes || null,
    });
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Update failed";
    redirect(`/entities/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/entities");
  revalidatePath(`/entities/${id}`);
  redirect(`/entities/${id}?saved=1`);
}

export async function deleteEntityAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/entities");
  try {
    await deleteEntity(user, id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    const msg = err instanceof Error ? err.message : "Delete failed";
    redirect(`/entities/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/entities");
  redirect("/entities");
}
