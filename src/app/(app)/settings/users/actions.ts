"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/session";
import {
  createUser,
  resetUserPassword,
  setUserActive,
  setUserEntityAccess,
  updateUserRole,
} from "@/lib/user-mutations";
import type { Role } from "@/lib/permissions";
import {
  encodePasswordFlash,
  USER_PASSWORD_FLASH_COOKIE,
  type PasswordFlash,
} from "@/lib/password-flash";

function back(qs?: string): never {
  redirect(`/settings/users${qs ? `?${qs}` : ""}`);
}

function isRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

async function ensureSession() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

async function setPasswordFlash(flash: PasswordFlash): Promise<void> {
  const store = await cookies();
  store.set(USER_PASSWORD_FLASH_COOKIE, encodePasswordFlash(flash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/settings/users",
    maxAge: 120,
  });
}

export async function createUserAction(formData: FormData): Promise<void> {
  const actor = await ensureSession();
  const email = String(formData.get("email") ?? "");
  const fullName = String(formData.get("fullName") ?? "");
  const role = String(formData.get("role") ?? "viewer") as Role;
  try {
    const created = await createUser(actor, { email, fullName, role });
    if (created.tempPassword) {
      await setPasswordFlash({
        kind: "created",
        userId: created.id,
        email: created.email,
        tempPassword: created.tempPassword,
      });
    }
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(`error=${encodeURIComponent(errorMessage(err))}`);
  }
  revalidatePath("/settings/users");
  back("created=1");
}

export async function updateRoleAction(formData: FormData): Promise<void> {
  const actor = await ensureSession();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!userId || !role) back();
  try {
    await updateUserRole(actor, userId, role);
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(`error=${encodeURIComponent(errorMessage(err))}`);
  }
  revalidatePath("/settings/users");
  back();
}

export async function toggleActiveAction(formData: FormData): Promise<void> {
  const actor = await ensureSession();
  const userId = String(formData.get("userId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  if (!userId) back();
  try {
    await setUserActive(actor, userId, isActive);
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(`error=${encodeURIComponent(errorMessage(err))}`);
  }
  revalidatePath("/settings/users");
  back();
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const actor = await ensureSession();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) back();
  try {
    const { tempPassword } = await resetUserPassword(actor, userId);
    await setPasswordFlash({ kind: "reset", userId, tempPassword });
    revalidatePath("/settings/users");
    back(`reset=${encodeURIComponent(userId)}`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(`error=${encodeURIComponent(errorMessage(err))}`);
  }
}

export async function setEntityAccessAction(formData: FormData): Promise<void> {
  const actor = await ensureSession();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) back();
  const entityIds = formData.getAll("entityIds").map((v) => String(v));
  const readOnlyIds = new Set(
    formData.getAll("readOnly").map((v) => String(v)),
  );
  const entries = entityIds.map((id) => ({
    entityId: id,
    accessLevel: (readOnlyIds.has(id) ? "read_only" : "full") as
      | "full"
      | "read_only",
  }));
  try {
    await setUserEntityAccess(actor, userId, entries);
  } catch (err) {
    if (isRedirect(err)) throw err;
    back(`error=${encodeURIComponent(errorMessage(err))}`);
  }
  revalidatePath("/settings/users");
  back(`access=${encodeURIComponent(userId)}`);
}
