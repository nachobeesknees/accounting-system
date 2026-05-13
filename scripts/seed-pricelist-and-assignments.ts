/**
 * Idempotent seed for:
 *   - One default office (HQ)
 *   - One current price list with the standard add-on charges
 *     (Annual Fee placeholder, Compliance Fee, FS Preparation, etc.)
 *   - Default assigned-employee on each existing customer
 */
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // 1. Office
  await sql`
    INSERT INTO offices (id, code, name, country, currency_code, is_active)
    VALUES ('o-hq', 'HQ', 'Thistlewood HQ', 'United States', 'USD', true)
    ON CONFLICT (id) DO NOTHING
  `;

  // 2. Price list — version 1, current
  await sql`
    INSERT INTO price_lists (id, office_id, name, version_number, effective_date, is_active, is_current)
    VALUES ('pl-2026', 'o-hq', 'Standard 2026', 1, '2026-01-01', true, true)
    ON CONFLICT (id) DO NOTHING
  `;

  // 3. Price list entries — the canonical add-on services
  // item_type values: 'entity_fee' | 'time_rate' | 'service'
  const entries = [
    // Recurring annual fee (placeholder; specific entity fees override via fee_schedules)
    { id: "ple-annual-fee", price_list_id: "pl-2026", item_type: "entity_fee", item_key: "annual_fee", label: "Annual Fee", unit_price: "0.00", included_quantity: null, notes: "Per-entity annual fee — see fee_schedules for tiered rates." },

    // Additional charges — the specific ones the user named
    { id: "ple-compliance", price_list_id: "pl-2026", item_type: "service", item_key: "compliance_fee", label: "Compliance Fee", unit_price: "750.00", included_quantity: null, notes: "Annual regulatory compliance and filings." },
    { id: "ple-fs-prep", price_list_id: "pl-2026", item_type: "service", item_key: "fs_preparation", label: "FS Preparation", unit_price: "1750.00", included_quantity: null, notes: "Financial statement preparation." },
    { id: "ple-tax-return", price_list_id: "pl-2026", item_type: "service", item_key: "tax_return", label: "Tax Return Preparation", unit_price: "2500.00", included_quantity: null, notes: "Federal + state tax filing." },
    { id: "ple-1099", price_list_id: "pl-2026", item_type: "service", item_key: "1099_filing", label: "1099 Filing", unit_price: "150.00", included_quantity: null, notes: "Per-contractor 1099 filing." },
    { id: "ple-board-mtg", price_list_id: "pl-2026", item_type: "service", item_key: "board_meeting", label: "Board Meeting Support", unit_price: "850.00", included_quantity: null, notes: "Per-meeting attendance + materials." },
    { id: "ple-cash-mgmt", price_list_id: "pl-2026", item_type: "service", item_key: "cash_management", label: "Cash Management", unit_price: "500.00", included_quantity: null, notes: "Monthly bank reconciliation and treasury support." },
    { id: "ple-ad-hoc", price_list_id: "pl-2026", item_type: "service", item_key: "ad_hoc_advisory", label: "Ad-hoc Advisory", unit_price: "350.00", included_quantity: null, notes: "Per-hour. Use Time Entries for variable bookings." },
  ];
  for (const e of entries) {
    await sql`
      INSERT INTO price_list_entries (id, price_list_id, item_type, item_key, label, unit_price, included_quantity, notes)
      VALUES (${e.id}, ${e.price_list_id}, ${e.item_type}, ${e.item_key}, ${e.label}, ${e.unit_price}, ${e.included_quantity}, ${e.notes})
      ON CONFLICT (id) DO UPDATE SET label = excluded.label, unit_price = excluded.unit_price, notes = excluded.notes
    `;
  }

  // 4. Assign demo employees to customers (round-robin)
  // Skip if already assigned. demo users live in seed.ts: u-margery (Bookkeeper),
  // u-aldous (Controller), u-eustace (CFO). Don't auto-assign CFO; the
  // assigned employee approves AFTER CFO so use bookkeeper/controller.
  const customers = await sql<{ id: string; assigned_user_id: string | null }[]>`
    SELECT id, assigned_user_id FROM customers ORDER BY code
  `;
  const assignableUsers = ["u-margery", "u-aldous"]; // Bookkeeper + Controller
  let i = 0;
  for (const c of customers) {
    if (c.assigned_user_id) continue;
    const userId = assignableUsers[i % assignableUsers.length];
    await sql`UPDATE customers SET assigned_user_id = ${userId}, updated_at = now() WHERE id = ${c.id}`;
    console.log(`  ${c.id} → ${userId}`);
    i++;
  }

  await sql.end();
  console.log("Done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
