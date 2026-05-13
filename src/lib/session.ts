/**
 * Cookie-based session. Signed cookie carrying the user id. The store
 * has a fixed set of demo users — login validates against a password
 * derived deterministically from the role.
 */

import "server-only";

import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { getUserById, getUsers } from "./data";
import type { SessionUser } from "./types";

const SECRET = process.env.SESSION_SECRET || "thistlewood-dev-secret-do-not-use-in-prod";
const COOKIE_NAME = "tw_session";

function sign(value: string): string {
  const h = createHmac("sha256", SECRET).update(value).digest("base64url");
  return `${value}.${h}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = createHmac("sha256", SECRET).update(value).digest("base64url");
  if (sig !== expected) return null;
  return value;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const userId = verify(raw);
  if (!userId) return null;
  const user = getUserById(userId);
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isSuperuser: user.isSuperuser,
  };
}

export async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Demo login — match against the seeded users by email + a known password.
 * Every demo account uses the password `demo123` regardless of role.
 */
export function authenticate(email: string, password: string): SessionUser | null {
  if (password !== "demo123") return null;
  const users = getUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isSuperuser: user.isSuperuser,
  };
}
