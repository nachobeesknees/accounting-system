/**
 * Repurpose the `offices` table as our firm's corporate billing entities.
 *
 * The user's mental model: a multi-entity firm bills clients FROM one of
 * several legal entities (Thistlewood US LLC, Thistlewood Caribbean Ltd,
 * Thistlewood Europe SARL, etc.). Each invoice and journal entry should
 * be attributed to the firm entity that issued it.
 *
 * This seed:
 *   1. Adds 3 firm entities (LLC / Trust Co / Europe SARL) to `offices`.
 *   2. Backfills firm_entity_id on existing journal_entries, journal_lines
 *      and invoices with the primary US LLC so older data shows under
 *      "All firms" AND the default firm scope.
 *
 * Idempotent.
 */
import postgres from "postgres";

const FIRMS = [
  {
    id: "f-us-llc",
    code: "TW-US",
    name: "Thistlewood US LLC",
    address: "1209 Orange Street, Wilmington DE 19801",
    currency_code: "USD",
    kind: "llc",
    jurisdiction: "Delaware, USA",
    ein: "47-2218104",
    registration_number: "DE-7421106",
    formation_date: "2011-04-12",
  },
  {
    id: "f-cay-ltd",
    code: "TW-CAY",
    name: "Thistlewood Trust Co. (Cayman) Ltd.",
    address: "PO Box 309, George Town, Grand Cayman KY1-1104",
    currency_code: "USD",
    kind: "trust_company",
    jurisdiction: "Cayman Islands",
    ein: null,
    registration_number: "CAY-188440",
    formation_date: "2015-02-03",
  },
  {
    id: "f-eu-sarl",
    code: "TW-EU",
    name: "Thistlewood Europe SARL",
    address: "Avenue de Cortenbergh 89, 1000 Brussels",
    currency_code: "EUR",
    kind: "sarl",
    jurisdiction: "Belgium",
    ein: null,
    registration_number: "BE-0768.219.412",
    formation_date: "2019-09-17",
  },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  try {
    let added = 0, updated = 0;
    for (const f of FIRMS) {
      const existing = await sql<{ id: string }[]>`SELECT id FROM offices WHERE id = ${f.id}`;
      if (existing.length > 0) {
        await sql`
          UPDATE offices SET
            code = ${f.code}, name = ${f.name}, address = ${f.address},
            currency_code = ${f.currency_code}, kind = ${f.kind},
            jurisdiction = ${f.jurisdiction}, ein = ${f.ein},
            registration_number = ${f.registration_number},
            formation_date = ${f.formation_date}, is_active = true,
            updated_at = now()
          WHERE id = ${f.id}
        `;
        updated++;
      } else {
        await sql`
          INSERT INTO offices (
            id, code, name, address, currency_code, kind, jurisdiction,
            ein, registration_number, formation_date, is_active
          ) VALUES (
            ${f.id}, ${f.code}, ${f.name}, ${f.address}, ${f.currency_code},
            ${f.kind}, ${f.jurisdiction}, ${f.ein}, ${f.registration_number},
            ${f.formation_date}, true
          )
        `;
        added++;
      }
    }
    console.log(`Firm entities: added ${added}, updated ${updated}.`);

    // Backfill firm_entity_id on existing rows with the US LLC.
    const defaultFirm = "f-us-llc";
    const je = await sql`UPDATE journal_entries SET firm_entity_id = ${defaultFirm} WHERE firm_entity_id IS NULL RETURNING id`;
    console.log(`Backfilled firm_entity_id on ${je.length} journal_entries.`);

    const jl = await sql`UPDATE journal_lines SET firm_entity_id = ${defaultFirm} WHERE firm_entity_id IS NULL RETURNING id`;
    console.log(`Backfilled firm_entity_id on ${jl.length} journal_lines.`);

    const inv = await sql`UPDATE invoices SET firm_entity_id = ${defaultFirm} WHERE firm_entity_id IS NULL RETURNING id`;
    console.log(`Backfilled firm_entity_id on ${inv.length} invoices.`);

    // Drop the old (client-entity) entityId from journal_entries — it
    // was the wrong semantic attribution. Reset to NULL so we don't
    // confuse the new firm scope with the legacy client-entity tagging.
    const cleared = await sql`UPDATE journal_entries SET entity_id = NULL WHERE entity_id IS NOT NULL RETURNING id`;
    console.log(`Cleared legacy entity_id on ${cleared.length} journal_entries.`);
    const clearedLines = await sql`UPDATE journal_lines SET entity_id = NULL WHERE entity_id IS NOT NULL RETURNING id`;
    console.log(`Cleared legacy entity_id on ${clearedLines.length} journal_lines.`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
