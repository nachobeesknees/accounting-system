/**
 * Backfill firm_entity_id on journal_entries, journal_lines, and invoices
 * so the topbar scope picker shows real numbers under each office.
 *
 * Strategy: split deterministically based on entry_date (or invoice_date)
 *   - odd day-of-month → OFC-SF (of-001)
 *   - even day-of-month → OFC-NY (of-002)
 *
 * That gives a roughly 50/50 split that's stable across runs (idempotent),
 * and only touches rows where firm_entity_id IS NULL.
 *
 * The chosen office must already exist — we look them up by code.
 *
 * Safe to re-run.
 */
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // Look up offices by code so the script doesn't hard-code id-shaped strings
  // that may have rotated across seed runs.
  const offices = await sql<Array<{ id: string; code: string }>>`
    SELECT id, code FROM offices WHERE code IN ('OFC-NY', 'OFC-SF')
  `;
  const byCode = new Map(offices.map((o) => [o.code, o.id]));
  const ofcNy = byCode.get("OFC-NY");
  const ofcSf = byCode.get("OFC-SF");
  if (!ofcNy || !ofcSf) {
    throw new Error(
      `Expected OFC-NY and OFC-SF offices; found: ${Array.from(byCode.keys()).join(", ")}`,
    );
  }

  // --- Journal entries -----------------------------------------------------
  const jeEven = await sql`
    UPDATE journal_entries
       SET firm_entity_id = ${ofcNy}
     WHERE firm_entity_id IS NULL
       AND EXTRACT(DAY FROM entry_date)::int % 2 = 0
    RETURNING id
  `;
  console.log(`journal_entries → OFC-NY: ${jeEven.count} rows`);

  const jeOdd = await sql`
    UPDATE journal_entries
       SET firm_entity_id = ${ofcSf}
     WHERE firm_entity_id IS NULL
    RETURNING id
  `;
  console.log(`journal_entries → OFC-SF: ${jeOdd.count} rows`);

  // --- Journal lines: copy from parent JE so they always stay in sync ------
  const jl = await sql`
    UPDATE journal_lines jl
       SET firm_entity_id = je.firm_entity_id
      FROM journal_entries je
     WHERE jl.journal_entry_id = je.id
       AND jl.firm_entity_id IS DISTINCT FROM je.firm_entity_id
    RETURNING jl.id
  `;
  console.log(`journal_lines synced to parent JE: ${jl.count} rows`);

  // --- Invoices ------------------------------------------------------------
  const invEven = await sql`
    UPDATE invoices
       SET firm_entity_id = ${ofcNy}
     WHERE firm_entity_id IS NULL
       AND EXTRACT(DAY FROM invoice_date)::int % 2 = 0
    RETURNING id
  `;
  console.log(`invoices → OFC-NY: ${invEven.count} rows`);

  const invOdd = await sql`
    UPDATE invoices
       SET firm_entity_id = ${ofcSf}
     WHERE firm_entity_id IS NULL
    RETURNING id
  `;
  console.log(`invoices → OFC-SF: ${invOdd.count} rows`);

  // --- Final inventory -----------------------------------------------------
  const inv = await sql`
    SELECT 'journal_entries' AS t, firm_entity_id, COUNT(*)::int AS n FROM journal_entries GROUP BY firm_entity_id
    UNION ALL
    SELECT 'journal_lines', firm_entity_id, COUNT(*)::int FROM journal_lines GROUP BY firm_entity_id
    UNION ALL
    SELECT 'invoices', firm_entity_id, COUNT(*)::int FROM invoices GROUP BY firm_entity_id
    ORDER BY t, firm_entity_id NULLS FIRST
  `;
  console.log("Final firm_entity_id counts:");
  console.table(inv);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
