/**
 * Migrate legacy customers.assigned_user_id into customer_assignments
 * (idempotent), then add a couple secondaries so the multi-assign UI
 * has interesting data to render.
 */
import postgres from "postgres";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  try {
    // 1. Backfill primaries from the legacy column
    const customers = await sql<{ id: string; assigned_user_id: string | null }[]>`
      SELECT id, assigned_user_id FROM customers
      WHERE assigned_user_id IS NOT NULL
    `;
    let primaryInserts = 0;
    for (const c of customers) {
      const existing = await sql`
        SELECT id FROM customer_assignments
        WHERE customer_id = ${c.id} AND user_id = ${c.assigned_user_id}
      `;
      if (existing.length > 0) continue;
      await sql`
        INSERT INTO customer_assignments (id, customer_id, user_id, is_primary, can_approve, role)
        VALUES (${uid("ca")}, ${c.id}, ${c.assigned_user_id}, true, true, 'primary')
      `;
      primaryInserts++;
    }
    console.log(`Primary assignments backfilled: ${primaryInserts}`);

    // 2. Add a secondary employee to the first 2 customers so multi-assign is visible
    const [firstTwo] = [await sql<{ id: string; assigned_user_id: string | null }[]>`
      SELECT id, assigned_user_id FROM customers ORDER BY code LIMIT 2
    `];
    const secondaries: { customer_id: string; user_id: string }[] = [];
    for (const c of firstTwo) {
      // Pick the other demo bookkeeper/controller
      const otherUser = c.assigned_user_id === "u-margery" ? "u-aldous" : "u-margery";
      const existing = await sql`
        SELECT id FROM customer_assignments
        WHERE customer_id = ${c.id} AND user_id = ${otherUser}
      `;
      if (existing.length > 0) continue;
      await sql`
        INSERT INTO customer_assignments (id, customer_id, user_id, is_primary, can_approve, role)
        VALUES (${uid("ca")}, ${c.id}, ${otherUser}, false, true, 'secondary')
      `;
      secondaries.push({ customer_id: c.id, user_id: otherUser });
    }
    console.log(`Secondary assignments added: ${secondaries.length}`);
    console.log("Done.");
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
