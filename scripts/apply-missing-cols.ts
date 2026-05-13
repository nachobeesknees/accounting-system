/**
 * Applies the schema columns the previous push prompts skipped. Run only when
 * `drizzle-kit push` is being held back by an interactive prompt and you've
 * confirmed the diff manually.
 */
import postgres from "postgres";

const STATEMENTS = [
  // entities.currency_code missing — root cause of /customers/[id] 500
  `ALTER TABLE entities ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'USD'`,
  // accounts.entity_id and journal_entries.entity_id for per-entity tracking
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS entity_id text`,
  `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS entity_id text`,
  // Drop the accounts.code unique constraint so multiple entities can share codes
  `ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_code_unique`,
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  for (const stmt of STATEMENTS) {
    console.log(`> ${stmt}`);
    await sql.unsafe(stmt);
  }
  console.log("Done.");
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
