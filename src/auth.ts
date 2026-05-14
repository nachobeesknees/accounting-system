/**
 * Full Auth.js v5 config. Extends the edge-safe `auth.config.ts` with a
 * Credentials provider that hits the DB + bcrypt. Only files that need
 * to *sign in* or *sign out* should import from here; everything else
 * should go through `lib/session.ts`.
 *
 * The Session.user shape is extended with `id`, `role`, and `isSuperuser`.
 */

import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { authConfig } from "./auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      isSuperuser: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    isSuperuser?: boolean;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const db = getDb();
        const [user] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1);

        if (!user || !user.isActive) return null;

        const stored = user.passwordHash ?? "";
        // Demo migration path: old seed left `$demo$demo123` as a sentinel
        // for un-hashed accounts. Recognise it so pre-migration seeded
        // users can still log in until reseeded.
        let ok = false;
        if (stored.startsWith("$demo$")) {
          ok = password === stored.slice("$demo$".length);
        } else if (stored.startsWith("$2")) {
          ok = await bcrypt.compare(password, stored);
        }
        if (!ok) return null;

        // Stamp last-login on success. Fire-and-forget so a transient
        // write error doesn't block sign-in.
        try {
          await db
            .update(schema.users)
            .set({ lastLoginAt: new Date() })
            .where(eq(schema.users.id, user.id));
        } catch {
          // ignore
        }

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          isSuperuser: user.isSuperuser,
        };
      },
    }),
  ],
});
