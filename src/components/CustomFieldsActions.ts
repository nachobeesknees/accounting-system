"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { getCustomFieldDefinitionById } from "@/lib/data";
import { setCustomFieldValue } from "@/lib/mutations";

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/**
 * Save all custom-field inputs from a `<CustomFields>` card. Expects
 * `recordId`, `definitionIds` (comma-separated), `redirectPath`, and a
 * `cf_<definitionId>` field per definition.
 */
export async function saveCustomFieldsAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const recordId = String(formData.get("recordId") ?? "");
  const ids = String(formData.get("definitionIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const redirectPath = String(formData.get("redirectPath") ?? "/");

  for (const defId of ids) {
    const def = await getCustomFieldDefinitionById(defId);
    if (!def) continue;
    const raw = formData.get(`cf_${defId}`);
    try {
      if (def.fieldType === "boolean") {
        await setCustomFieldValue(user, {
          definitionId: defId,
          recordId,
          valueBoolean: raw === "on",
        });
      } else if (def.fieldType === "number") {
        const s = typeof raw === "string" ? raw.trim() : "";
        await setCustomFieldValue(user, {
          definitionId: defId,
          recordId,
          valueNumber: s === "" ? null : Number(s),
        });
      } else if (def.fieldType === "date") {
        const s = typeof raw === "string" ? raw.trim() : "";
        await setCustomFieldValue(user, {
          definitionId: defId,
          recordId,
          valueDate: s || null,
        });
      } else {
        // text + select both stored in valueText
        const s = typeof raw === "string" ? raw.trim() : "";
        await setCustomFieldValue(user, {
          definitionId: defId,
          recordId,
          valueText: s || null,
        });
      }
    } catch (err) {
      if (isRedirect(err)) throw err;
    }
  }
  revalidatePath(redirectPath);
  redirect(`${redirectPath}?saved=1`);
}
