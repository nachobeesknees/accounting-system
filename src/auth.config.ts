/**
 * Edge-safe Auth.js config. This file is imported by the middleware,
 * which runs on the edge runtime — so it cannot reach the DB or use
 * bcrypt. Heavy auth logic (authorize() with DB + bcrypt) lives in
 * `auth.ts` which extends this config server-side.
 *
 * Splitting the config is the standard Auth.js v5 pattern:
 * https://authjs.dev/guides/edge-compatibility
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id;
        token.role = (user as { role?: string }).role;
        token.isSuperuser = (user as { isSuperuser?: boolean }).isSuperuser;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id as string | undefined) ?? "";
        session.user.role = (token.role as string | undefined) ?? "viewer";
        session.user.isSuperuser = !!token.isSuperuser;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
