import "server-only";

/**
 * Variance Analysis computation — actuals vs budget or prior year, monthly
 * or YTD, consolidated across all firm entities (budgets aren't entity-
 * scoped, so the comparison is only meaningful at the consolidated level).
 */

import {
  getAccounts,
  getBudgetByAccountForMonths,
  getSignedBalancesInRangePublic,
} from "./data";

export type VarianceMode = "monthly" | "ytd";
export type VarianceCompare = "budget" | "prior_year";

export type VarianceRow = {
  accountId: string;
  code: string;
  name: string;
  accountType: "revenue" | "expense";
  actual: number;
  comparison: number;
  variance: number;
  /** null when the comparison base is zero. */
  variancePct: number | null;
  favorable: boolean;
};

export type VarianceReport = {
  rows: VarianceRow[];
  period: { start: string; end: string; label: string };
  compareLabel: string;
  totals: {
    revenue: { actual: number; comparison: number; variance: number };
    expenses: { actual: number; comparison: number; variance: number };
    net: { actual: number; comparison: number; variance: number };
  };
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthRange(year: number, fromMonth: number, toMonth: number) {
  const start = `${year}-${String(fromMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, toMonth, 0)).getUTCDate();
  const end = `${year}-${String(toMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function variancePeriod(
  fiscalYear: number,
  month: number,
  mode: VarianceMode,
): { start: string; end: string; label: string } {
  const fromMonth = mode === "monthly" ? month : 1;
  const { start, end } = monthRange(fiscalYear, fromMonth, month);
  const label =
    mode === "monthly"
      ? `${MONTH_NAMES[month - 1]} ${fiscalYear}`
      : `YTD through ${MONTH_NAMES[month - 1]} ${fiscalYear}`;
  return { start, end, label };
}

export async function computeVariance(
  fiscalYear: number,
  month: number,
  mode: VarianceMode,
  compare: VarianceCompare,
): Promise<VarianceReport> {
  const period = variancePeriod(fiscalYear, month, mode);
  const fromMonth = mode === "monthly" ? month : 1;

  const accounts = await getAccounts("all");
  const actualRaw = await getSignedBalancesInRangePublic(period.start, period.end, "all");

  let comparisonSigned: Map<string, number>;
  let compareLabel: string;
  if (compare === "budget") {
    // Budgets store positive amounts for both revenue and expenses.
    comparisonSigned = await getBudgetByAccountForMonths(fiscalYear, fromMonth, month);
    compareLabel = "Budget";
  } else {
    const prior = variancePeriod(fiscalYear - 1, month, mode);
    const priorRaw = await getSignedBalancesInRangePublic(prior.start, prior.end, "all");
    // Transform to income-statement sign below alongside actuals.
    comparisonSigned = priorRaw;
    compareLabel = `Prior year (${fiscalYear - 1})`;
  }

  const rows: VarianceRow[] = [];
  for (const a of accounts) {
    if (a.accountType !== "revenue" && a.accountType !== "expense") continue;
    const isRevenue = a.accountType === "revenue";
    const rawActual = actualRaw.get(a.id) ?? 0;
    const actual = isRevenue ? -rawActual : rawActual;
    let comparison: number;
    if (compare === "budget") {
      comparison = comparisonSigned.get(a.id) ?? 0;
    } else {
      const rawPrior = comparisonSigned.get(a.id) ?? 0;
      comparison = isRevenue ? -rawPrior : rawPrior;
    }
    if (actual === 0 && comparison === 0) continue;
    const variance = actual - comparison;
    rows.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      accountType: a.accountType,
      actual,
      comparison,
      variance,
      variancePct: comparison !== 0 ? variance / Math.abs(comparison) : null,
      // Revenue above plan is favorable; expenses above plan are not.
      favorable: isRevenue ? variance >= 0 : variance <= 0,
    });
  }
  rows.sort((r1, r2) => r1.code.localeCompare(r2.code));

  const sum = (t: "revenue" | "expense", f: (r: VarianceRow) => number) =>
    rows.filter((r) => r.accountType === t).reduce((s, r) => s + f(r), 0);
  const totals = {
    revenue: {
      actual: sum("revenue", (r) => r.actual),
      comparison: sum("revenue", (r) => r.comparison),
      variance: sum("revenue", (r) => r.variance),
    },
    expenses: {
      actual: sum("expense", (r) => r.actual),
      comparison: sum("expense", (r) => r.comparison),
      variance: sum("expense", (r) => r.variance),
    },
    net: { actual: 0, comparison: 0, variance: 0 },
  };
  totals.net = {
    actual: totals.revenue.actual - totals.expenses.actual,
    comparison: totals.revenue.comparison - totals.expenses.comparison,
    variance: totals.revenue.variance - totals.expenses.variance,
  };

  return { rows, period, compareLabel, totals };
}

/** Material rows worth an AI explanation: |variance| ≥ $100 AND (no base
 *  or ≥ 2% swing). Keeps the LLM call focused on lines an accountant would
 *  actually comment on. */
export function materialRows(rows: VarianceRow[]): VarianceRow[] {
  return rows.filter(
    (r) =>
      Math.abs(r.variance) >= 100 &&
      (r.variancePct === null || Math.abs(r.variancePct) >= 0.02),
  );
}
