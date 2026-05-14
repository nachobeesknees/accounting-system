/**
 * Route protection. Wraps every request in an Auth.js v5 session check.
 * The exception list covers /login, /api/auth, and static asset paths
 * so those continue to render without a session.
 *
 * Edge-safe: imports `auth.config.ts` (no DB / bcrypt) and lets the JWT
 * cookie carry the user identity. Heavy auth logic (authorize, bcrypt)
 * runs only inside the Node-runtime `auth.ts` config.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set<string>(["/login"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  return false;
}

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  if (isPublic(path)) return NextResponse.next();
  if (!req.auth) {
    const url = nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  // Match everything except static assets + the auth API. The handler
  // above does its own filtering; this matcher trims the edge function
  // from running on truly static traffic.
  matcher: ["/((?!_next/static|_next/image|favicon|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp|woff2?)).*)"],
};
