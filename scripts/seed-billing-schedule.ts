/**
 * Seed:
 *   1. Convert existing entity_fees to annual frequency starting on the
 *      entity's formation_date (or 2026-01-01 if missing), with annual
 *      billing in March.
 *   2. Add a couple of monthly retainer / quarterly tax examples to
 *      demonstrate frequency variation.
 *   3. Seed recurring_payments: monthly rent, biweekly payroll, quarterly
 *      tax payment, annual insurance renewal.
 */
import postgres from "postgres";

function pad(n: number, w: number) {
  return n.toString().padStart(w, "0");
}
function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    // 1. Convert existing entity fees: frequency=annual, startDate=formation, billingMonth=3 (March)
    const fees = await sql<{ id: string; entity_id: string; annual_fee: string }[]>`
      SELECT ef.id, ef.entity_id, ef.annual_fee
      FROM entity_fees ef
      WHERE ef.frequency IS NULL OR ef.frequency = 'annual'
    `;
    let updated = 0;
    for (const fee of fees) {
      const [ent] = await sql<{ formation_date: string | null }[]>`
        SELECT formation_date FROM entities WHERE id = ${fee.entity_id} LIMIT 1
      `;
      const start = ent?.formation_date ?? "2026-01-01";
      // Next billing = March of current year (or next year if past)
      const today = new Date();
      let nextBill = new Date(today.getFullYear(), 2, 1); // March 1
      if (nextBill < today) nextBill = new Date(today.getFullYear() + 1, 2, 1);
      const nextBillStr = nextBill.toISOString().slice(0, 10);
      await sql`
        UPDATE entity_fees SET
          frequency = 'annual',
          start_date = ${start},
          billing_month = 3,
          billing_day = 1,
          next_billing_date = ${nextBillStr},
          per_period_amount = annual_fee,
          updated_at = now()
        WHERE id = ${fee.id}
      `;
      updated++;
    }
    console.log(`Updated ${updated} entity_fees with annual frequency.`);

    // 2. Add a few example fees with different frequencies
    // Find Pumpernickel Holdings to add a monthly retainer
    const [pump] = await sql<{ id: string }[]>`SELECT id FROM entities WHERE code = 'ENT-001' LIMIT 1`;
    if (pump) {
      const existing = await sql`
        SELECT id FROM entity_fees
        WHERE entity_id = ${pump.id} AND billing_year = 2026 AND frequency = 'monthly'
        LIMIT 1
      `;
      if (existing.length === 0) {
        const monthlyId = uid("ef-monthly");
        const nextDate = "2026-06-01"; // next month
        await sql`
          INSERT INTO entity_fees (
            id, entity_id, billing_year, fee_schedule_id, annual_fee,
            included_hours, status, invoice_id, notes,
            frequency, start_date, billing_day, next_billing_date, per_period_amount
          ) VALUES (
            ${monthlyId}, ${pump.id}, 2026, NULL, '60000.00',
            '0', 'active', NULL, 'Monthly bookkeeping retainer.',
            'monthly', '2026-01-01', 1, ${nextDate}, '5000.00'
          )
        `;
        console.log(`  + Monthly bookkeeping retainer on ENT-001 ($5,000/mo).`);
      }
    }

    // Quarterly fee on Snickerthorpe Master Trust
    const [snick] = await sql<{ id: string }[]>`SELECT id FROM entities WHERE code = 'ENT-003' LIMIT 1`;
    if (snick) {
      const existing = await sql`
        SELECT id FROM entity_fees
        WHERE entity_id = ${snick.id} AND billing_year = 2026 AND frequency = 'quarterly'
        LIMIT 1
      `;
      if (existing.length === 0) {
        const qid = uid("ef-quarterly");
        await sql`
          INSERT INTO entity_fees (
            id, entity_id, billing_year, fee_schedule_id, annual_fee,
            included_hours, status, invoice_id, notes,
            frequency, start_date, billing_month, billing_day,
            next_billing_date, per_period_amount
          ) VALUES (
            ${qid}, ${snick.id}, 2026, NULL, '36000.00',
            '0', 'active', NULL, 'Quarterly trust admin.',
            'quarterly', '2026-01-01', 7, 1,
            '2026-07-01', '9000.00'
          )
        `;
        console.log(`  + Quarterly trust admin on ENT-003 ($9,000/qtr).`);
      }
    }

    // 3. Recurring payments
    const recurringSeed = [
      { name: "Office rent — Nettlesome Property Mgmt", amount: "4000.00", frequency: "monthly", next: "2026-06-01", account: "a-5000", vendor: "v-003" },
      { name: "Payroll (biweekly)", amount: "28500.00", frequency: "biweekly", next: "2026-05-23", account: "a-5100", vendor: null },
      { name: "Federal estimated tax", amount: "12000.00", frequency: "quarterly", next: "2026-06-15", account: "a-2100", vendor: null },
      { name: "E&O insurance renewal", amount: "15460.00", frequency: "annual", next: "2027-04-15", account: "a-5400", vendor: "v-005" },
      { name: "Cloud hosting", amount: "350.00", frequency: "monthly", next: "2026-06-01", account: "a-5400", vendor: null },
    ];
    let recAdded = 0;
    for (const r of recurringSeed) {
      const exists = await sql`SELECT id FROM recurring_payments WHERE name = ${r.name}`;
      if (exists.length > 0) continue;
      const id = uid("rp");
      await sql`
        INSERT INTO recurring_payments (
          id, name, amount, frequency, next_payment_date, expense_account_id,
          vendor_id, bank_account_id, is_active, notes
        ) VALUES (
          ${id}, ${r.name}, ${r.amount}, ${r.frequency}, ${r.next}, ${r.account},
          ${r.vendor}, NULL, true, NULL
        )
      `;
      recAdded++;
    }
    console.log(`Added ${recAdded} recurring payments.`);

    // 4. Backfill expected_payment_date on outstanding invoices using
    // a simple "due_date + 5 days" heuristic so the cash forecast has data
    const filled = await sql`
      UPDATE invoices
      SET expected_payment_date = (due_date::date + interval '5 days')::date
      WHERE expected_payment_date IS NULL AND balance_due::numeric > 0
      RETURNING id
    `;
    console.log(`Backfilled expected_payment_date on ${filled.length} invoices.`);

    console.log("Done.");
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
