"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createEntity } from "@/lib/mutations";
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

export type CreateEntityState = { error: string | null };

export async function createEntityAction(
  _prev: CreateEntityState,
  formData: FormData,
): Promise<CreateEntityState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  const statusRaw = String(formData.get("status") ?? "active");
  const jurisdiction = String(formData.get("jurisdiction") ?? "").trim();
  const formationDate = String(formData.get("formationDate") ?? "").trim();
  const ein = String(formData.get("ein") ?? "").trim();
  const registrationNumber = String(formData.get("registrationNumber") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const currencyCode = String(formData.get("currencyCode") ?? "USD").trim().toUpperCase();
  const ownershipRaw = String(formData.get("ownershipPercent") ?? "").trim();
  const ownershipPercent =
    ownershipRaw === ""
      ? null
      : Math.max(0, Math.min(100, parseFloat(ownershipRaw)));

  if (!code) return { error: "Code is required." };
  if (!name) return { error: "Name is required." };
  if (!clientId) return { error: "Client is required." };
  if (!(VALID_KINDS as readonly string[]).includes(kindRaw)) {
    return { error: "Invalid entity kind." };
  }
  if (!(VALID_STATUSES as readonly string[]).includes(statusRaw)) {
    return { error: "Invalid status." };
  }

  try {
    const created = await createEntity(user, {
      code,
      name,
      clientId,
      kind: kindRaw as EntityKind,
      status: statusRaw as EntityStatus,
      jurisdiction: jurisdiction || null,
      formationDate: formationDate || null,
      ein: ein || null,
      registrationNumber: registrationNumber || null,
      notes: notes || null,
      currencyCode: currencyCode || "USD",
      ownershipPercent,
    });
    revalidatePath("/entities");
    redirect(`/entities/${created.id}`);
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
    return { error: err instanceof Error ? err.message : "Failed to create entity." };
  }
}
