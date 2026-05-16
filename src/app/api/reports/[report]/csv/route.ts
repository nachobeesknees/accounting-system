import { NextResponse } from "next/server";
import { serializeCsv } from "@/lib/csv";
import { getSessionUser } from "@/lib/session";
import {
  accountsByType,
  getBudgetByAccount,
  getIncomeStatementForPeriod,
  getKpisAsOf,
  getMonthlyIncomeStatement,
  getTrialBalance,
} from "@/lib/data";
import { resolveEntityScope } from "@/lib/entity-scope";
import {
  parseCompare,
  parsePreset,
  priorPeriod,
  priorYearPeriod,
  resolvePeriod,
  type CompareMode,
} from "@/lib/report-periods";
import { formatAmount } from "@/lib/money";

type ReportKey =
  | "trial-balance"
  | "balance-sheet"
  | "income-statement"
  | "income-statement-monthly";

const VALID: ReportKey[] = [
  "trial-balance",
  "balance-sheet",
  "income-statement",
  "income-statement-monthly",
];

const MONTH_HEADERS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function money(n: number): string {
  return formatAmount(n, { paren: true });
}

function pctChange(curr: number, prev: number): string {
  if (prev === 0) return curr === 0 ? "0%" : "—";
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  return `${p.toFixed(1)}%`;
}

function csvResponse(filename: string, body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ report: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { report } = await context.params;
  if (!VALID.includes(report as ReportKey)) {
    return NextResponse.json({ error: "unknown report" }, { status: 404 });
  }
  const key = report as ReportKey;
  const url = new URL(request.url);
  const sp = url.searchParams;
  // resolveEntityScope handles office / region / all. Downstream helpers
  // accept the tagged-union directly via FirmScopeArg.
  const scope = await resolveEntityScope();
  const today = new Date();

  if (key === "trial-balance") {
    const tb = await getTrialBalance();
    const rows = tb.map((r) => ({
      Code: r.code,
      Account: r.name,
      Debit: r.debit === 0 ? "" : money(r.debit),
      Credit: r.credit === 0 ? "" : money(r.credit),
    }));
    const debitTotal = tb.reduce((s, r) => s + r.debit, 0);
    const creditTotal = tb.reduce((s, r) => s + r.credit, 0);
    rows.push({
      Code: "",
      Account: "Totals",
      Debit: money(debitTotal),
      Credit: money(creditTotal),
    });
    const body = serializeCsv(["Code", "Account", "Debit", "Credit"], rows);
    return csvResponse(
      `trial-balance-${today.toISOString().slice(0, 10)}.csv`,
      body,
    );
  }

  const preset = parsePreset(sp.get("preset"));
  const compare = parseCompare(sp.get("compare")) as CompareMode;
  const period = resolvePeriod(
    preset,
    today,
    sp.get("from") ?? undefined,
    sp.get("to") ?? undefined,
  );

  if (key === "balance-sheet") {
    const asOf = period.end;
    const kpis = await getKpisAsOf(asOf, scope);
    const byType = await accountsByType();

    // Comparison: prior-period or prior-year balance sheet at the prior
    // window's END date. Budget is meaningless for the BS so it's
    // silently ignored.
    let cmpKpis: typeof kpis | null = null;
    let cmpLabel = "";
    if (compare === "prior_period") {
      const p = priorPeriod(period.start, period.end);
      cmpKpis = await getKpisAsOf(p.end, scope);
      cmpLabel = `As of ${p.end}`;
    } else if (compare === "prior_year") {
      const p = priorYearPeriod(period.start, period.end);
      cmpKpis = await getKpisAsOf(p.end, scope);
      cmpLabel = `As of ${p.end}`;
    }

    const headers = cmpKpis
      ? ["Section", "Code", "Account", `As of ${asOf}`, cmpLabel, "Δ"]
      : ["Section", "Code", "Account", `As of ${asOf}`];
    const rows: Array<Record<string, unknown>> = [];

    const sectionTotals: Record<string, { curr: number; prev: number }> = {
      Assets: { curr: kpis.assets, prev: cmpKpis?.assets ?? 0 },
      Liabilities: { curr: kpis.liabilities, prev: cmpKpis?.liabilities ?? 0 },
      Equity: {
        curr: kpis.equity + kpis.netIncome,
        prev: (cmpKpis?.equity ?? 0) + (cmpKpis?.netIncome ?? 0),
      },
    };

    rows.push({ Section: "Total Assets", Code: "", Account: "",
      [`As of ${asOf}`]: money(sectionTotals.Assets.curr),
      ...(cmpKpis ? { [cmpLabel]: money(sectionTotals.Assets.prev), "Δ": money(sectionTotals.Assets.curr - sectionTotals.Assets.prev) } : {}),
    });
    rows.push({ Section: "Total Liabilities", Code: "", Account: "",
      [`As of ${asOf}`]: money(sectionTotals.Liabilities.curr),
      ...(cmpKpis ? { [cmpLabel]: money(sectionTotals.Liabilities.prev), "Δ": money(sectionTotals.Liabilities.curr - sectionTotals.Liabilities.prev) } : {}),
    });
    rows.push({ Section: "Total Equity", Code: "", Account: "",
      [`As of ${asOf}`]: money(sectionTotals.Equity.curr),
      ...(cmpKpis ? { [cmpLabel]: money(sectionTotals.Equity.prev), "Δ": money(sectionTotals.Equity.curr - sectionTotals.Equity.prev) } : {}),
    });

    const body = serializeCsv(headers, rows);
    return csvResponse(`balance-sheet-${asOf}.csv`, body);
  }

  if (key === "income-statement") {
    const { rows: isRows, revenue, expenses, netIncome } =
      await getIncomeStatementForPeriod(period.start, period.end, scope);

    let cmpMap: Map<string, number> | null = null;
    let cmpLabel = "";
    let cmpTotal: { revenue: number; expenses: number; netIncome: number } | null = null;

    if (compare === "prior_period") {
      const p = priorPeriod(period.start, period.end);
      const r = await getIncomeStatementForPeriod(p.start, p.end, scope);
      cmpMap = new Map(r.rows.map((x) => [x.accountId, x.amount]));
      cmpTotal = { revenue: r.revenue, expenses: r.expenses, netIncome: r.netIncome };
      cmpLabel = `${p.start} → ${p.end}`;
    } else if (compare === "prior_year") {
      const p = priorYearPeriod(period.start, period.end);
      const r = await getIncomeStatementForPeriod(p.start, p.end, scope);
      cmpMap = new Map(r.rows.map((x) => [x.accountId, x.amount]));
      cmpTotal = { revenue: r.revenue, expenses: r.expenses, netIncome: r.netIncome };
      cmpLabel = `${p.start} → ${p.end}`;
    } else if (compare === "budget") {
      const year = parseInt(period.start.slice(0, 4), 10);
      cmpMap = await getBudgetByAccount(year);
      cmpLabel = `Budget ${year}`;
    }

    const periodCol = `${period.start} → ${period.end}`;
    const headers = cmpMap
      ? ["Code", "Account", "Type", periodCol, cmpLabel, "Δ", "Δ %"]
      : ["Code", "Account", "Type", periodCol];

    const rows: Array<Record<string, unknown>> = isRows.map((r) => {
      const cmp = cmpMap?.get(r.accountId) ?? 0;
      return cmpMap
        ? {
            Code: r.code,
            Account: r.name,
            Type: r.accountType,
            [periodCol]: money(r.amount),
            [cmpLabel]: money(cmp),
            "Δ": money(r.amount - cmp),
            "Δ %": pctChange(r.amount, cmp),
          }
        : {
            Code: r.code,
            Account: r.name,
            Type: r.accountType,
            [periodCol]: money(r.amount),
          };
    });

    // Totals
    function totalRow(label: string, curr: number, prev: number | null) {
      return cmpMap
        ? {
            Code: "",
            Account: label,
            Type: "",
            [periodCol]: money(curr),
            [cmpLabel]: prev == null ? "" : money(prev),
            "Δ": prev == null ? "" : money(curr - prev),
            "Δ %": prev == null ? "" : pctChange(curr, prev),
          }
        : { Code: "", Account: label, Type: "", [periodCol]: money(curr) };
    }
    rows.push(totalRow("Total Revenue", revenue, cmpTotal?.revenue ?? null));
    rows.push(totalRow("Total Expenses", expenses, cmpTotal?.expenses ?? null));
    rows.push(totalRow("Net Income", netIncome, cmpTotal?.netIncome ?? null));

    const body = serializeCsv(headers, rows);
    return csvResponse(
      `income-statement-${period.start}-to-${period.end}.csv`,
      body,
    );
  }

  // income-statement-monthly
  const year = parseInt(
    sp.get("year") ?? String(today.getUTCFullYear()),
    10,
  );
  const m = await getMonthlyIncomeStatement(year, scope);
  const headers = ["Code", "Account", "Type", ...MONTH_HEADERS, "Total"];
  const rows: Array<Record<string, unknown>> = m.rows.map((r) => {
    const obj: Record<string, unknown> = {
      Code: r.code,
      Account: r.name,
      Type: r.accountType,
      Total: money(r.total),
    };
    for (let i = 0; i < 12; i++) obj[MONTH_HEADERS[i]] = money(r.byMonth[i]);
    return obj;
  });
  function totalsRow(label: string, arr: number[]) {
    const obj: Record<string, unknown> = {
      Code: "",
      Account: label,
      Type: "",
      Total: money(arr.reduce((s, v) => s + v, 0)),
    };
    for (let i = 0; i < 12; i++) obj[MONTH_HEADERS[i]] = money(arr[i]);
    return obj;
  }
  rows.push(totalsRow("Total Revenue", m.revenueByMonth));
  rows.push(totalsRow("Total Expenses", m.expensesByMonth));
  rows.push(totalsRow("Net Income", m.netByMonth));
  const body = serializeCsv(headers, rows);
  return csvResponse(`income-statement-${year}-monthly.csv`, body);
}
