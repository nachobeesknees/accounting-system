/**
 * Idempotent seed for region groups, regions, and the built-in "Department"
 * dimension. Run after sync-schema.ts. Safe to re-run.
 */
import postgres from "postgres";

type Row = { id: string };

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // --- Region groups (Americas / EMEA / APAC) -----------------------------
  const groups: Array<{ id: string; name: string; order: number }> = [
    { id: "rg-americas", name: "Americas", order: 10 },
    { id: "rg-emea", name: "EMEA", order: 20 },
    { id: "rg-apac", name: "APAC", order: 30 },
  ];
  for (const g of groups) {
    const exists = await sql<Row[]>`SELECT id FROM region_groups WHERE id = ${g.id}`;
    if (exists.length === 0) {
      await sql`INSERT INTO region_groups (id, name, display_order) VALUES (${g.id}, ${g.name}, ${g.order})`;
      console.log(`+ region_group ${g.name}`);
    } else {
      console.log(`= region_group ${g.name} (exists)`);
    }
  }

  // --- Regions ------------------------------------------------------------
  const regions: Array<{ id: string; name: string; groupId: string; order: number }> = [
    { id: "rgn-north-america", name: "North America", groupId: "rg-americas", order: 10 },
    { id: "rgn-caribbean", name: "Caribbean", groupId: "rg-americas", order: 20 },
    { id: "rgn-western-europe", name: "Western Europe", groupId: "rg-emea", order: 10 },
    { id: "rgn-uk-ireland", name: "UK & Ireland", groupId: "rg-emea", order: 20 },
    { id: "rgn-asia", name: "Asia", groupId: "rg-apac", order: 10 },
  ];
  for (const r of regions) {
    const exists = await sql<Row[]>`SELECT id FROM regions WHERE id = ${r.id}`;
    if (exists.length === 0) {
      await sql`INSERT INTO regions (id, name, group_id, display_order) VALUES (${r.id}, ${r.name}, ${r.groupId}, ${r.order})`;
      console.log(`+ region ${r.name}`);
    } else {
      console.log(`= region ${r.name} (exists)`);
    }
  }

  // --- Attach existing offices to regions (best-effort by jurisdiction) ---
  const offices = await sql<Array<{ id: string; code: string; jurisdiction: string | null; region_id: string | null }>>`
    SELECT id, code, jurisdiction, region_id FROM offices
  `;
  for (const o of offices) {
    if (o.region_id) continue;
    let regionId: string | null = null;
    const j = (o.jurisdiction ?? "").toLowerCase();
    const code = o.code.toLowerCase();
    // North America catches the US firm entities under any naming —
    // TW-US (the firm-entity demo), OFC-NY / OFC-SF (the post-seed
    // shape), or any "Thistlewood" office. Wider patterns first so
    // they don't get masked by more specific later branches.
    if (
      j.includes("delaware") ||
      j.includes("us") ||
      j.includes("united states") ||
      code.includes("us") ||
      code.includes("ofc-ny") ||
      code.includes("ofc-sf") ||
      code.includes("nyc") ||
      code.includes("sfo")
    ) {
      regionId = "rgn-north-america";
    } else if (j.includes("cayman") || code.includes("cay")) {
      regionId = "rgn-caribbean";
    } else if (j.includes("luxembourg") || j.includes("eu") || j.includes("europe") || j.includes("sarl") || code.includes("eu")) {
      regionId = "rgn-western-europe";
    } else if (j.includes("uk") || j.includes("ireland") || j.includes("britain")) {
      regionId = "rgn-uk-ireland";
    } else if (j.includes("singapore") || j.includes("japan") || j.includes("hong kong")) {
      regionId = "rgn-asia";
    }
    if (regionId) {
      await sql`UPDATE offices SET region_id = ${regionId}, updated_at = NOW() WHERE id = ${o.id}`;
      console.log(`+ office ${o.code} → ${regionId}`);
    }
  }

  // --- Department dimension + sample values -------------------------------
  const deptDim = await sql<Row[]>`SELECT id FROM dimensions WHERE key = 'department'`;
  if (deptDim.length === 0) {
    await sql`INSERT INTO dimensions (id, key, label, description, display_order)
              VALUES ('dim-department', 'department', 'Department', 'Internal department/cost-center responsible for the line.', 10)`;
    console.log("+ dimension department");
  } else {
    console.log("= dimension department (exists)");
  }

  const projectDim = await sql<Row[]>`SELECT id FROM dimensions WHERE key = 'project'`;
  if (projectDim.length === 0) {
    await sql`INSERT INTO dimensions (id, key, label, description, display_order)
              VALUES ('dim-project', 'project', 'Project', 'Internal project / client engagement code.', 20)`;
    console.log("+ dimension project");
  } else {
    console.log("= dimension project (exists)");
  }

  const departments: Array<{ id: string; code: string; label: string; order: number }> = [
    { id: "dv-dep-tax", code: "TAX", label: "Tax", order: 10 },
    { id: "dv-dep-audit", code: "AUDIT", label: "Audit & Assurance", order: 20 },
    { id: "dv-dep-advisory", code: "ADV", label: "Advisory", order: 30 },
    { id: "dv-dep-ops", code: "OPS", label: "Operations", order: 40 },
    { id: "dv-dep-admin", code: "ADMIN", label: "Administration", order: 50 },
  ];
  for (const d of departments) {
    const exists = await sql<Row[]>`SELECT id FROM dimension_values WHERE id = ${d.id}`;
    if (exists.length === 0) {
      await sql`INSERT INTO dimension_values (id, dimension_id, code, label, display_order)
                VALUES (${d.id}, 'dim-department', ${d.code}, ${d.label}, ${d.order})`;
      console.log(`+ dim_value department ${d.label}`);
    } else {
      console.log(`= dim_value department ${d.label} (exists)`);
    }
  }

  await sql.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
