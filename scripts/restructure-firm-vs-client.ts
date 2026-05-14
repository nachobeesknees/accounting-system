/**
 * Undo the earlier mistake: the 8 user-spec'd names belong on OFFICES
 * (firm corporate entities — what we bill clients FROM), not on the
 * CLIENT entities (the things clients own that we keep books for).
 *
 * Steps:
 *  1. Restore ENT-001..ENT-008 to their original demo names from
 *     src/lib/seed.ts so client books reads correctly again.
 *  2. Replace the offices set:
 *       US (4):    Teton Trust Company, LLC
 *                  Grand Teton Services, LLC
 *                  Wyoming Foundation Services, LLC
 *                  CM New York, LLC
 *       Latam (1): CM Services SA
 *       Asia (3):  Cone Marshall (HK) Limited
 *                  Cone Marshall Singapore
 *                  Cone Marshall Singapore Trust Company
 *     Old OFC-NY / OFC-SF are mapped to OFC-CMNY and OFC-TETON
 *     respectively so existing journal_entries.firm_entity_id /
 *     invoices.firm_entity_id keep pointing at a valid office.
 *  3. Re-attach each office to its region (US / Latam / Asia).
 *  4. Re-attach client entities to regions based on the client they
 *     belong to (was previously a side-effect of the renames).
 *
 * Idempotent — re-runs are safe.
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

// Original demo names per src/lib/seed.ts for e-001..e-010.
const CLIENT_ENTITIES: Array<{
  id: string;
  code: string;
  name: string;
  kind: string;
  jurisdiction: string;
  ein: string | null;
  notes: string | null;
  currencyCode: string;
}> = [
  { id: "e-001", code: "ENT-001", name: "Pumpernickel Holdings LLC",          kind: "llc",         jurisdiction: "Delaware, USA",        ein: "47-1102841", notes: "Master holding company",                  currencyCode: "USD" },
  { id: "e-002", code: "ENT-002", name: "Pumpernickel Family Trust",          kind: "trust",       jurisdiction: "South Dakota, USA",    ein: null,         notes: "Irrevocable dynasty trust",               currencyCode: "USD" },
  { id: "e-003", code: "ENT-003", name: "Snickerthorpe Master Trust",         kind: "trust",       jurisdiction: "Nevada, USA",          ein: null,         notes: null,                                      currencyCode: "USD" },
  { id: "e-004", code: "ENT-004", name: "Snickerthorpe Real Estate LLC",      kind: "llc",         jurisdiction: "New York, USA",        ein: "85-2901774", notes: "Manhattan commercial portfolio",          currencyCode: "USD" },
  { id: "e-005", code: "ENT-005", name: "Snickerthorpe Capital Partners",     kind: "partnership", jurisdiction: "Delaware, USA",        ein: "82-4429110", notes: "PE fund vehicle",                         currencyCode: "USD" },
  { id: "e-006", code: "ENT-006", name: "Mumblethrottle Holdings Inc.",       kind: "ccorp",       jurisdiction: "Massachusetts, USA",   ein: "04-3712209", notes: null,                                      currencyCode: "USD" },
  { id: "e-007", code: "ENT-007", name: "Mumblethrottle Charitable Foundation", kind: "foundation", jurisdiction: "Massachusetts, USA",   ein: "27-0044112", notes: "501(c)(3) private foundation",            currencyCode: "USD" },
  { id: "e-008", code: "ENT-008", name: "Tsukimomo USA LLC",                  kind: "llc",         jurisdiction: "Delaware, USA",        ein: "84-3119008", notes: "US-facing subsidiary of Tokyo parent",   currencyCode: "JPY" },
];

// Firm entities (= offices). All addresses + EINs are placeholder demo
// data; the demo seed never relied on them being real.
type FirmEntity = {
  id: string;
  code: string;
  name: string;
  kind: string;
  jurisdiction: string;
  formationDate: string;
  ein: string | null;
  registrationNumber: string | null;
  address: string | null;
  currencyCode: string;
  regionId: string;
  /** Optional alias of the OLD office id this row replaces — used so
   *  existing firm_entity_id FKs on JEs/invoices keep pointing at us. */
  replacesOfficeId?: string;
};

const FIRM_ENTITIES: FirmEntity[] = [
  // US — replaces OFC-SF with Teton Trust Company so JEs stay attributed.
  { id: "of-teton",   code: "TETON",     name: "Teton Trust Company, LLC",            kind: "trust_company", jurisdiction: "Wyoming, USA",    formationDate: "2018-04-12", ein: "84-3001112", registrationNumber: "WY-T-118412", address: "200 W Broadway, Jackson WY 83001",  currencyCode: "USD", regionId: "rgn-us",    replacesOfficeId: "of-001" },
  { id: "of-grand",   code: "GRAND",     name: "Grand Teton Services, LLC",           kind: "llc",           jurisdiction: "Wyoming, USA",    formationDate: "2020-06-19", ein: "85-4112200", registrationNumber: "WY-L-220119", address: "200 W Broadway, Jackson WY 83001",  currencyCode: "USD", regionId: "rgn-us" },
  { id: "of-wyofnd",  code: "WYO-FND",   name: "Wyoming Foundation Services, LLC",    kind: "llc",           jurisdiction: "Wyoming, USA",    formationDate: "2017-11-03", ein: "82-7900441", registrationNumber: "WY-L-171103", address: "200 W Broadway, Jackson WY 83001",  currencyCode: "USD", regionId: "rgn-us" },
  // Replaces OFC-NY so JEs stay attributed.
  { id: "of-cmny",    code: "CMNY",      name: "CM New York, LLC",                    kind: "llc",           jurisdiction: "New York, USA",   formationDate: "2015-09-08", ein: "47-3098144", registrationNumber: "NY-L-150908", address: "300 Park Ave, New York NY 10022",   currencyCode: "USD", regionId: "rgn-us",    replacesOfficeId: "of-002" },

  // Latam
  { id: "of-cmsa",    code: "CM-SA",     name: "CM Services SA",                      kind: "scorp",         jurisdiction: "Panama",          formationDate: "2019-03-21", ein: null,         registrationNumber: "PA-SA-190321", address: "Av Balboa, Panama City",            currencyCode: "USD", regionId: "rgn-latam" },

  // Asia
  { id: "of-cmhk",    code: "CM-HK",     name: "Cone Marshall (HK) Limited",          kind: "llc",           jurisdiction: "Hong Kong",       formationDate: "2007-05-09", ein: null,         registrationNumber: "HK-1023144",   address: "Two IFC, 8 Finance St, Central",     currencyCode: "USD", regionId: "rgn-asia" },
  { id: "of-cmsg",    code: "CM-SG",     name: "Cone Marshall Singapore",             kind: "llc",           jurisdiction: "Singapore",       formationDate: "2010-11-30", ein: null,         registrationNumber: "SG-201018111E", address: "1 Raffles Place, Singapore 048616",  currencyCode: "USD", regionId: "rgn-asia" },
  { id: "of-cmsgtc",  code: "CM-SG-TC",  name: "Cone Marshall Singapore Trust Company", kind: "trust_company", jurisdiction: "Singapore",       formationDate: "2014-02-17", ein: null,         registrationNumber: "SG-201408803W", address: "1 Raffles Place, Singapore 048616",  currencyCode: "USD", regionId: "rgn-asia" },
];

async function main() {
  // -------- 1. Restore client-entity names ------------------------------
  for (const e of CLIENT_ENTITIES) {
    await sql`
      UPDATE entities
         SET name = ${e.name},
             kind = ${e.kind},
             jurisdiction = ${e.jurisdiction},
             ein = ${e.ein},
             notes = ${e.notes},
             currency_code = ${e.currencyCode},
             region_id = NULL,
             updated_at = NOW()
       WHERE id = ${e.id}
    `;
    console.log(`= entity ${e.id} restored to "${e.name}"`);
  }

  // -------- 2. Re-point firm_entity_id from old → new offices -----------
  for (const f of FIRM_ENTITIES) {
    if (!f.replacesOfficeId) continue;
    const j = await sql`
      UPDATE journal_entries SET firm_entity_id = ${f.id}
      WHERE firm_entity_id = ${f.replacesOfficeId}
      RETURNING id
    `;
    const l = await sql`
      UPDATE journal_lines SET firm_entity_id = ${f.id}
      WHERE firm_entity_id = ${f.replacesOfficeId}
      RETURNING id
    `;
    const i = await sql`
      UPDATE invoices SET firm_entity_id = ${f.id}
      WHERE firm_entity_id = ${f.replacesOfficeId}
      RETURNING id
    `;
    console.log(
      `+ re-point ${f.replacesOfficeId} → ${f.id}: JEs=${j.count} lines=${l.count} invoices=${i.count}`,
    );
  }

  // -------- 3. Replace the offices set ----------------------------------
  // Delete the old OFC-NY/OFC-SF offices now that their JEs are re-pointed.
  await sql`DELETE FROM offices WHERE id IN ('of-001', 'of-002')`;
  console.log("- deleted old offices OFC-NY / OFC-SF");

  for (const f of FIRM_ENTITIES) {
    await sql`
      INSERT INTO offices (id, code, name, address, currency_code, kind, jurisdiction, ein, registration_number, formation_date, region_id, is_active, notes)
      VALUES (${f.id}, ${f.code}, ${f.name}, ${f.address}, ${f.currencyCode}, ${f.kind}, ${f.jurisdiction}, ${f.ein}, ${f.registrationNumber}, ${f.formationDate}, ${f.regionId}, true, NULL)
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        currency_code = EXCLUDED.currency_code,
        kind = EXCLUDED.kind,
        jurisdiction = EXCLUDED.jurisdiction,
        ein = EXCLUDED.ein,
        registration_number = EXCLUDED.registration_number,
        formation_date = EXCLUDED.formation_date,
        region_id = EXCLUDED.region_id,
        is_active = true,
        updated_at = NOW()
    `;
    console.log(`+ office ${f.code} → "${f.name}" (${f.regionId})`);
  }

  // -------- 4. Re-attach client entities + customers to regions ---------
  // Client entities follow their owning client's region — and the
  // client's region defaults to US for the demo set (most clients are
  // US-based). EU client (Frogsworth) → EU, JP client (Tsukimomo) → Asia.
  const clientRegionByCustomer: Record<string, string> = {
    "c-001": "rgn-us",
    "c-002": "rgn-us",
    "c-003": "rgn-us",
    "c-004": "rgn-asia",  // Tsukimomo — Tokyo parent
    "c-005": "rgn-eu",    // Frogsworth — UK family office
  };
  for (const [customerId, regionId] of Object.entries(clientRegionByCustomer)) {
    await sql`UPDATE customers SET region_id = ${regionId}, updated_at = NOW() WHERE id = ${customerId}`;
    await sql`UPDATE entities SET region_id = ${regionId}, updated_at = NOW() WHERE client_id = ${customerId}`;
    console.log(`+ customer ${customerId} + its entities → ${regionId}`);
  }

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
