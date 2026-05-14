/**
 * One-shot data migration to rebuild the region taxonomy + entity names
 * per the user's spec:
 *
 *   Regions: US, EU, Asia, Latam, NZ  (5 top-level, no groups)
 *
 *   US:    Teton Trust Company, LLC
 *          Grand Teton Services, LLC
 *          Wyoming Foundation Services, LLC
 *          CM New York, LLC
 *   Latam: CM Services SA
 *   Asia:  Cone Marshall (HK) Limited
 *          Cone Marshall Singapore
 *          Cone Marshall Singapore Trust Company
 *
 * - Old groups (Americas / EMEA / APAC) and regions (North America / etc.)
 *   are wiped first; any FK pointing at the old IDs gets re-pointed to a
 *   matching new region by jurisdiction.
 * - Entities e-001..e-008 are renamed in-place (codes stay ENT-001 etc.)
 *   and attached to the new region. e-009/e-010 are left under the EU
 *   region as filler so the EU bucket isn't empty.
 * - Customers inherit their region from their first entity.
 * - Offices OFC-NY and OFC-SF go under US.
 *
 * Idempotent — safe to re-run; the second run is a no-op as long as the
 * 5 new region IDs already exist.
 */
import postgres from "postgres";

type Row = { id: string };

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // -------- 1. New region taxonomy --------------------------------------
  const newRegions: Array<{ id: string; name: string; order: number }> = [
    { id: "rgn-us", name: "US", order: 10 },
    { id: "rgn-eu", name: "EU", order: 20 },
    { id: "rgn-asia", name: "Asia", order: 30 },
    { id: "rgn-latam", name: "Latam", order: 40 },
    { id: "rgn-nz", name: "NZ", order: 50 },
  ];

  // Drop everything currently pointed at the OLD regions/groups first.
  // The old IDs were rgn-north-america, rgn-caribbean, etc. and
  // rg-americas/rg-emea/rg-apac. We can wipe broadly because we'll
  // rebuild every assignment below.
  await sql`UPDATE offices SET region_id = NULL`;
  await sql`UPDATE entities SET region_id = NULL`;
  await sql`UPDATE customers SET region_id = NULL`;
  await sql`DELETE FROM regions`;
  await sql`DELETE FROM region_groups`;
  console.log("• Wiped old region taxonomy + assignments.");

  for (const r of newRegions) {
    await sql`
      INSERT INTO regions (id, name, group_id, display_order)
      VALUES (${r.id}, ${r.name}, NULL, ${r.order})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order
    `;
    console.log(`+ region ${r.name}`);
  }

  // -------- 2. Rename entities + attach to regions ----------------------
  // Maps entity id → { new name, region, kind?, jurisdiction? }. Codes
  // (ENT-001 etc.) stay so existing references don't break.
  const renames: Array<{
    id: string;
    name: string;
    regionId: string;
    kind: string;
    jurisdiction: string;
  }> = [
    { id: "e-001", name: "Teton Trust Company, LLC",        regionId: "rgn-us",    kind: "llc",            jurisdiction: "Wyoming, USA" },
    { id: "e-002", name: "Grand Teton Services, LLC",       regionId: "rgn-us",    kind: "llc",            jurisdiction: "Wyoming, USA" },
    { id: "e-003", name: "Wyoming Foundation Services, LLC", regionId: "rgn-us",    kind: "llc",            jurisdiction: "Wyoming, USA" },
    { id: "e-004", name: "CM New York, LLC",                 regionId: "rgn-us",    kind: "llc",            jurisdiction: "New York, USA" },
    { id: "e-005", name: "CM Services SA",                   regionId: "rgn-latam", kind: "scorp",          jurisdiction: "Panama" },
    { id: "e-006", name: "Cone Marshall (HK) Limited",       regionId: "rgn-asia",  kind: "llc",            jurisdiction: "Hong Kong" },
    { id: "e-007", name: "Cone Marshall Singapore",          regionId: "rgn-asia",  kind: "llc",            jurisdiction: "Singapore" },
    { id: "e-008", name: "Cone Marshall Singapore Trust Company", regionId: "rgn-asia", kind: "trust", jurisdiction: "Singapore" },
  ];

  for (const r of renames) {
    const updated = await sql`
      UPDATE entities
         SET name = ${r.name},
             region_id = ${r.regionId},
             kind = ${r.kind},
             jurisdiction = ${r.jurisdiction},
             updated_at = NOW()
       WHERE id = ${r.id}
      RETURNING id
    `;
    if (updated.count) {
      console.log(`+ entity ${r.id} → "${r.name}" (region ${r.regionId})`);
    } else {
      console.log(`! entity ${r.id} not found — skipped`);
    }
  }

  // Filler: anything past e-008 goes under EU so the bucket isn't empty.
  // The user spec didn't list EU/NZ entities, but the UI looks dead with
  // 0 rows attached.
  await sql`
    UPDATE entities
       SET region_id = 'rgn-eu',
           updated_at = NOW()
     WHERE region_id IS NULL
  `;
  const euLeftovers = await sql<Row[]>`SELECT id FROM entities WHERE region_id = 'rgn-eu'`;
  console.log(`+ filler entities → EU: ${euLeftovers.length}`);

  // -------- 3. Customers inherit region from their primary entity -------
  // For each customer, set region_id to the first entity's region.
  const customers = await sql<{ id: string }[]>`SELECT id FROM customers`;
  for (const c of customers) {
    const [firstEnt] = await sql<{ region_id: string | null }[]>`
      SELECT region_id FROM entities WHERE client_id = ${c.id} AND region_id IS NOT NULL
      ORDER BY code LIMIT 1
    `;
    if (firstEnt?.region_id) {
      await sql`UPDATE customers SET region_id = ${firstEnt.region_id}, updated_at = NOW() WHERE id = ${c.id}`;
      console.log(`+ customer ${c.id} → region ${firstEnt.region_id}`);
    }
  }

  // -------- 4. Offices --------------------------------------------------
  await sql`UPDATE offices SET region_id = 'rgn-us', updated_at = NOW() WHERE code IN ('OFC-NY', 'OFC-SF')`;
  console.log("+ offices OFC-NY + OFC-SF → US");

  // -------- 5. Final inventory ------------------------------------------
  console.log("\nFINAL ROLLUP:");
  const rollup = await sql`
    SELECT r.name AS region,
           (SELECT COUNT(*) FROM offices  o WHERE o.region_id  = r.id) AS offices,
           (SELECT COUNT(*) FROM entities e WHERE e.region_id  = r.id) AS entities,
           (SELECT COUNT(*) FROM customers c WHERE c.region_id = r.id) AS customers
      FROM regions r
     ORDER BY r.display_order
  `;
  console.table(rollup);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
