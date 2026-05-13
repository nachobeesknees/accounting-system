/**
 * Create a few invoices in pending_cfo / pending_assigned state so the
 * dashboard's "Awaiting your approval" inbox has something to show.
 * Uses raw SQL to avoid the server-only import chain.
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
    // Find customers with entity fees for 2026
    const candidates = await sql<{ customer_id: string; customer_code: string; entity_id: string; entity_name: string; entity_code: string; annual_fee: string }[]>`
      SELECT c.id AS customer_id, c.code AS customer_code,
             e.id AS entity_id, e.name AS entity_name, e.code AS entity_code,
             ef.annual_fee
      FROM customers c
      JOIN entities e ON e.client_id = c.id
      JOIN entity_fees ef ON ef.entity_id = e.id
      WHERE ef.billing_year = 2026 AND ef.annual_fee::numeric > 0 AND c.is_active = true
      ORDER BY c.code, e.code
    `;

    // Group by customer
    const byCustomer = new Map<string, typeof candidates>();
    for (const r of candidates) {
      const arr = byCustomer.get(r.customer_id) ?? [];
      arr.push(r);
      byCustomer.set(r.customer_id, arr);
    }

    // Pick 2 customers — first stays pending_cfo, second gets CFO-approved → pending_assigned
    const customerIds = Array.from(byCustomer.keys()).slice(0, 2);
    if (customerIds.length === 0) {
      console.log("No customers with 2026 entity fees found.");
      return;
    }

    // Next invoice number
    const [maxRow] = await sql<{ invoice_number: string }[]>`
      SELECT invoice_number FROM invoices ORDER BY invoice_number DESC LIMIT 1
    `;
    let nextN = parseInt(maxRow?.invoice_number.match(/(\d+)$/)?.[1] ?? "0", 10) + 1;

    let pendingCfo = 0, pendingAssigned = 0;
    for (let i = 0; i < customerIds.length; i++) {
      const custId = customerIds[i];
      const rows = byCustomer.get(custId)!;
      const invId = uid("i");
      const invNum = `INV-${pad(nextN++, 6)}`;
      const today = new Date().toISOString().slice(0, 10);
      const due = new Date(); due.setDate(due.getDate() + 30);
      const dueStr = due.toISOString().slice(0, 10);

      // Build lines: one per entity fee + one Compliance Fee add-on
      type Line = { description: string; quantity: string; unitPrice: string; amount: string };
      const lines: Line[] = rows.map((r) => ({
        description: `Annual fee — ${r.entity_name} (${r.entity_code}, 2026)`,
        quantity: "1",
        unitPrice: r.annual_fee,
        amount: r.annual_fee,
      }));
      lines.push({
        description: "Compliance Fee",
        quantity: "1",
        unitPrice: "750.00",
        amount: "750.00",
      });

      const subtotal = lines.reduce((s, l) => s + parseFloat(l.amount), 0).toFixed(2);

      // For the second customer we'll also CFO-approve
      const isSecond = i === 1;
      const status = "pending_cfo"; // both start here
      const cfoApprovedAt = null;
      const cfoApprovedBy = null;

      await sql`
        INSERT INTO invoices (
          id, invoice_number, customer_id, invoice_date, due_date, status,
          subtotal, tax_amount, total, amount_paid, balance_due, currency_code,
          notes, journal_entry_id, cfo_approved_at, cfo_approved_by
        ) VALUES (
          ${invId}, ${invNum}, ${custId}, ${today}, ${dueStr}, ${status},
          ${subtotal}, '0.00', ${subtotal}, '0.00', ${subtotal}, 'USD',
          ${'Demo pending-approval invoice for the dashboard inbox.'},
          NULL, ${cfoApprovedAt}, ${cfoApprovedBy}
        )
      `;
      // Insert lines
      for (let li = 0; li < lines.length; li++) {
        const l = lines[li];
        await sql`
          INSERT INTO invoice_lines (
            id, invoice_id, line_number, description, quantity, unit_price, amount, account_id
          ) VALUES (
            ${`${invId}-l${li + 1}`}, ${invId}, ${li + 1}, ${l.description},
            ${l.quantity}, ${l.unitPrice}, ${l.amount}, 'a-4000'
          )
        `;
      }
      console.log(`  ${invNum} (${rows[0].customer_code}, ${lines.length} lines) → pending_cfo`);
      pendingCfo++;

      if (isSecond) {
        await sql`
          UPDATE invoices
          SET status = 'pending_assigned',
              cfo_approved_at = now(),
              cfo_approved_by = 'u-admin',
              updated_at = now()
          WHERE id = ${invId}
        `;
        pendingAssigned++;
        pendingCfo--;
        console.log(`    → CFO-approved → pending_assigned`);
      }
    }

    console.log(`\nCreated ${pendingCfo} pending_cfo + ${pendingAssigned} pending_assigned demo invoices.`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
