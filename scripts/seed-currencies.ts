/**
 * Seed base currencies + a few common ones so the /currencies page renders.
 */
import postgres from "postgres";

const ROWS = [
  { code: "USD", symbol: "$",  name: "US Dollar",       decimals: 2, is_base: true,  is_active: true },
  { code: "EUR", symbol: "€",  name: "Euro",            decimals: 2, is_base: false, is_active: true },
  { code: "GBP", symbol: "£",  name: "British Pound",   decimals: 2, is_base: false, is_active: true },
  { code: "JPY", symbol: "¥",  name: "Japanese Yen",    decimals: 0, is_base: false, is_active: true },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc",     decimals: 2, is_base: false, is_active: true },
  { code: "CAD", symbol: "$",  name: "Canadian Dollar", decimals: 2, is_base: false, is_active: true },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  for (const r of ROWS) {
    await sql`
      INSERT INTO currencies (code, symbol, name, decimals, is_base, is_active)
      VALUES (${r.code}, ${r.symbol}, ${r.name}, ${r.decimals}, ${r.is_base}, ${r.is_active})
      ON CONFLICT (code) DO NOTHING
    `;
  }
  console.log(`Seeded ${ROWS.length} currencies.`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
