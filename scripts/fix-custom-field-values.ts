/**
 * Rename custom_field_values.field_id → definition_id to match schema.ts.
 * Idempotent.
 */
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const [r] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='custom_field_values' AND column_name='field_id'
    ) AS exists
  `;
  if (r.exists) {
    console.log("Renaming field_id → definition_id");
    await sql.unsafe(`ALTER TABLE custom_field_values RENAME COLUMN field_id TO definition_id`);
  } else {
    console.log("Already renamed (no field_id column)");
  }
  await sql.end();
  console.log("Done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
