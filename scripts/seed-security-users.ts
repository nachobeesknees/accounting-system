/**
 * Seed the three canonical security-module demo users. Idempotent —
 * upserts on email so re-running is safe. Run after sync-schema.ts.
 *
 *   admin@thistlewood.com / Admin123!  — super_admin
 *   accountant@thistlewood.com / Demo123! — accountant
 *   viewer@thistlewood.com / Demo123! — viewer
 *
 * Existing seeded demo users (margery, aldous, eustace, etc.) keep
 * their `$demo$demo123` sentinels — those still log in with "demo123"
 * via the demo migration path in auth.ts.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotenvLocal();

import bcrypt from "bcryptjs";
import postgres from "postgres";

const USERS = [
  {
    id: "u-admin",
    email: "admin@thistlewood.com",
    fullName: "Demo Admin",
    password: "Admin123!",
    role: "super_admin",
    isSuperuser: true,
  },
  {
    id: "u-accountant",
    email: "accountant@thistlewood.com",
    fullName: "Demo Accountant",
    password: "Demo123!",
    role: "accountant",
    isSuperuser: false,
  },
  {
    id: "u-viewer",
    email: "viewer@thistlewood.com",
    fullName: "Demo Viewer",
    password: "Demo123!",
    role: "viewer",
    isSuperuser: false,
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = postgres(url);

  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await sql`
      INSERT INTO users (id, email, full_name, password_hash, role, is_superuser, is_active)
      VALUES (${u.id}, ${u.email}, ${u.fullName}, ${hash}, ${u.role}, ${u.isSuperuser}, true)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        is_superuser = EXCLUDED.is_superuser,
        is_active = true,
        full_name = EXCLUDED.full_name
    `;
    console.log(`+ user ${u.email} (${u.role})`);
  }

  await sql.end();
}

function loadDotenvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!(key in process.env)) {
        process.env[key] = value.replace(/^"(.*)"$/, "$1");
      }
    }
  } catch {
    // .env.local missing — fall back to whatever's in process.env already.
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
