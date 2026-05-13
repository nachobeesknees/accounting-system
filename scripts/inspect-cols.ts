import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const tables = [
    "invoices","invoice_lines","customers","bills","bill_lines",
    "price_lists","price_list_items","entity_fees","fee_schedules","entities","contacts",
  ];
  for (const t of tables) {
    const r = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name=${t} ORDER BY ordinal_position`;
    console.log(`${t}: ${r.length ? r.map(x => x.column_name).join(", ") : "(no such table)"}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
