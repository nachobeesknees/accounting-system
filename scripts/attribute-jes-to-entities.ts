/**
 * Make the multi-entity scope picker actually show different books per
 * entity by attributing a slice of existing posted journal entries to
 * specific entities. Idempotent — only touches rows where entity_id is
 * still NULL.
 *
 * Approach: pick a few JEs by reference (invoice number / bill number)
 * and set their entity_id to the entity tied to that customer/vendor's
 * client. For demo simplicity we just route invoices/bills to the
 * first entity owned by the related client.
 */
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  try {
    // Strategy: for each invoice that has a journal_entry_id and a customerId,
    // find the customer's first entity and set the JE's entity_id to it.
    const invoiceJes = await sql<{ je_id: string; customer_id: string }[]>`
      SELECT i.journal_entry_id AS je_id, i.customer_id
      FROM invoices i
      WHERE i.journal_entry_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = i.journal_entry_id AND je.entity_id IS NULL)
    `;
    console.log(`Invoice-linked JEs to attribute: ${invoiceJes.length}`);

    let attributed = 0;
    for (const row of invoiceJes) {
      // First entity owned by this customer's client (client_id = customer.id in our seed)
      const [ent] = await sql<{ id: string }[]>`
        SELECT id FROM entities WHERE client_id = ${row.customer_id} ORDER BY code LIMIT 1
      `;
      if (!ent) continue;
      await sql`
        UPDATE journal_entries SET entity_id = ${ent.id}, updated_at = now()
        WHERE id = ${row.je_id}
      `;
      // And the lines on it, so per-account-per-entity rollups also work
      await sql`
        UPDATE journal_lines SET entity_id = ${ent.id}
        WHERE journal_entry_id = ${row.je_id}
      `;
      attributed++;
    }

    // Same for bills → first entity of the customer that owns the vendor?
    // Bills don't have a direct entity link via vendor; skip for now —
    // they stay firm-level.

    console.log(`Attributed ${attributed} invoice JEs to entities.`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
