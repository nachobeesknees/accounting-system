/**
 * Session helpers. Thin layer over Auth.js v5 — `getSessionUser()` is
 * the canonical way to ask "who is logged in?" anywhere in the app.
 * Returns null when there's no valid session.
 *
 * Pre-security-module this file held a hand-rolled HMAC cookie scheme.
 * The interface stayed the same so the 180+ existing call-sites keep
 * working unchanged.
 */

import "server-only";

import { auth, signIn, signOut } from "@/auth";
import type { SessionUser } from "./types";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u || !u.id) return null;
  return {
    userId: u.id,
    email: u.email ?? "",
    fullName: u.name ?? "",
    role: u.role ?? "viewer",
    isSuperuser: !!u.isSuperuser,
  };
}

/** Server-action sign-in. Throws/redirects on failure (Auth.js behaviour). */
export async function signInWithCredentials(
  email: string,
  password: string,
  redirectTo: string = "/",
) {
  await signIn("credentials", { email, password, redirectTo });
}

export async function signOutAndRedirect(redirectTo: string = "/login") {
  await signOut({ redirectTo });
}
