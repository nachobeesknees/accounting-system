/**
 * Seed annual + monthly budgets for the current + prior fiscal year, derived
 * from each revenue / expense account's most recent year of actuals plus a
 * small growth uplift. Idempotent — only inserts a budget for an
 * (account_id, fiscal_year, month) tuple that doesn't already exist, so
 * users can override individual months by hand later without the seed
 * stomping their edits on re-run.
 *
 * The "budget" Compare mode on /reports income statement already wires up
 * to whatever this table holds; this seed exists so the comparison shows
 * meaningful numbers in the demo instead of a column of zeros.
 */
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const accounts = await sql<
    Array<{ id: string; code: string; account_type: string }>
  >`SELECT id, code, account_type FROM accounts
     WHERE account_type IN ('revenue', 'expense') AND is_active = true
     ORDER BY code`;

  if (accounts.length === 0) {
    console.log("No revenue/expense accounts. Nothing to seed.");
    await sql.end();
    return;
  }

  // Use 2026 as the fiscal year (matches DEMO_TODAY in the app).
  const currentYear = 2026;
  const priorYear = currentYear - 1;

  // Derive a target annual amount per account from posted activity in the
  // prior 365 days. Falls back to a synthetic baseline so accounts with
  // no history still get a non-zero budget for demo purposes.
  const today = new Date();
  const yearAgo = new Date(today);
  yearAgo.setDate(yearAgo.getDate() - 365);
  const yearAgoIso = yearAgo.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  const baselineByAccount = new Map<string, number>();
  for (const a of accounts) {
    const result = await sql<{ total: string }[]>`
      SELECT COALESCE(SUM(
        CASE
          WHEN ${a.account_type} = 'revenue' THEN jl.credit - jl.debit
          ELSE jl.debit - jl.credit
        END
      ), 0) AS total
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_entry_id = je.id
      WHERE jl.account_id = ${a.id}
        AND je.status = 'posted'
        AND je.entry_date >= ${yearAgoIso}
        AND je.entry_date <= ${todayIso}
    `;
    const actual = parseFloat(result[0].total) || 0;
    // Synthetic baseline if no actuals: revenue accounts get $100k/yr,
    // expense accounts get $20k/yr. Keeps the demo's budget column
    // populated for accounts the seed data hasn't exercised yet.
    const baseline =
      actual > 0
        ? actual * 1.08 // 8% growth target on top of prior actuals
        : a.account_type === "revenue"
          ? 100000
          : 20000;
    baselineByAccount.set(a.id, baseline);
  }

  // Spread the annual baseline evenly across the 12 months. Round to 2dp.
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  let inserted = 0;
  let skipped = 0;

  for (const a of accounts) {
    const annual = baselineByAccount.get(a.id) ?? 0;
    const perMonth = Math.round((annual / 12) * 100) / 100;

    for (const year of [priorYear, currentYear]) {
      for (const month of months) {
        const id = `bdg-${a.code}-${year}-${String(month).padStart(2, "0")}`;
        const [existing] = await sql`SELECT id FROM budgets WHERE id = ${id}`;
        if (existing) {
          skipped++;
          continue;
        }
        // Add a tiny per-month seasonal jitter so months differ slightly.
        const jitter = 1 + ((month % 4) - 2) * 0.04;
        const amount = (perMonth * jitter).toFixed(2);
        await sql`
          INSERT INTO budgets (id, account_id, fiscal_year, month, amount, notes)
          VALUES (${id}, ${a.id}, ${year}, ${month}, ${amount}, ${"Seed: derived from trailing 12-month actuals + 8% growth"})
        `;
        inserted++;
      }
    }
  }

  console.log(
    `Budgets — inserted ${inserted}, skipped (already present) ${skipped}.`,
  );

  // Quick sanity check
  const sample = await sql<
    Array<{ code: string; fiscal_year: number; total: string }>
  >`
    SELECT a.code, b.fiscal_year, SUM(b.amount)::numeric(15,2) AS total
      FROM budgets b
      JOIN accounts a ON b.account_id = a.id
     GROUP BY a.code, b.fiscal_year
     ORDER BY b.fiscal_year DESC, a.code
     LIMIT 12
  `;
  console.log("Annual totals (first 12 rows):");
  console.table(sample);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
