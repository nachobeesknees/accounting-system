"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getSessionUser } from "@/lib/session";
import { saveSavedView, deleteSavedView } from "@/lib/mutations";

const ALLOWED_ROUTES = new Set<string>([
  "/invoices",
  "/bills",
  "/journal",
  "/vendors",
  "/customers",
  "/entities",
]);

function safeRoute(route: string): string {
  return ALLOWED_ROUTES.has(route) ? route : "/invoices";
}

/**
 * Persist the current list filter/sort params as a named saved view for the
 * logged-in user. The hidden `params` field carries the serialized query
 * string (URLSearchParams-style) captured client-side. Ownership is stamped
 * server-side from the session — never trusted from the form.
 */
export async function saveViewAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const route = safeRoute(String(formData.get("route") ?? "").trim());
  const name = String(formData.get("name") ?? "").trim();
  const makeDefault = String(formData.get("makeDefault") ?? "") === "1";
  const rawParams = String(formData.get("params") ?? "");

  const parsed = new URLSearchParams(rawParams);
  const params: Record<string, string> = {};
  for (const [k, v] of parsed.entries()) {
    if (v !== "") params[k] = v;
  }

  if (!name) {
    redirect(`${route}?error=${encodeURIComponent("Give the view a name.")}`);
  }

  try {
    await saveSavedView(user, { route, name, params, makeDefault });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save the view.";
    redirect(`${route}?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath(route);
  // Land back on the exact filtered view we just saved.
  const qs = new URLSearchParams(params).toString();
  redirect(`${route}${qs ? `?${qs}` : ""}`);
}

/**
 * Delete one of the current user's saved views. The mutation pins userId in
 * its WHERE clause, so a user can never delete another user's view.
 */
export async function deleteViewAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const route = safeRoute(String(formData.get("route") ?? "").trim());
  const viewId = String(formData.get("viewId") ?? "").trim();

  try {
    await deleteSavedView(user, viewId);
  } catch {
    // Deletion is best-effort; fall through to the list either way.
  }

  revalidatePath(route);
  redirect(route);
}
