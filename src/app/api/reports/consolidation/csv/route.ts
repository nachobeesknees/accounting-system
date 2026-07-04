import { NextResponse } from "next/server";

import { serializeCsv } from "@/lib/csv";
import {
  convertToBase,
  getBaseCurrency,
  getFirmPlRollup,
  getLatestFxRates,
  getOffices,
} from "@/lib/data";
import { formatAmount } from "@/lib/money";
import { requirePermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

/**
 * Consolidation CSV — the firm's corporate entities (offices) consolidated
 * to base currency with intercompany eliminations. Mirrors the
 * /consolidation page's "Per firm entity P&L (posted)" table.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    requirePermission(user, "report.export_csv");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [rollup, offices, base, fxRates] = await Promise.all([
    getFirmPlRollup("all"),
    getOffices(),
    getBaseCurrency(),
    getLatestFxRates(),
  ]);
  const baseCode = base?.code ?? "USD";
  const officeById = new Map(offices.map((o) => [o.id, o] as const));
  const money = (n: number) => formatAmount(n, { paren: true });

  const rows = rollup.rows.map((r) => {
    const office = r.officeId ? officeById.get(r.officeId) : undefined;
    const ccy = office?.currencyCode ?? baseCode;
    const conv = (n: number) =>
      ccy === baseCode ? n : (convertToBase(n, ccy, fxRates) ?? 0);
    return {
      officeId: r.officeId,
      label: office
        ? `${office.code} — ${office.name}`
        : "Firm-level (unattributed)",
      ccy,
      revenueNative: r.revenue,
      expensesNative: r.expenses,
      netNative: r.netIncome,
      revenueBase: conv(r.revenue),
      expensesBase: conv(r.expenses),
      netBase: conv(r.netIncome),
    };
  });
  rows.sort((a, b) => {
    if (a.officeId == null) return 1;
    if (b.officeId == null) return -1;
    return a.label.localeCompare(b.label);
  });

  const elim = rollup.eliminations;
  const hasElim =
    elim.revenue !== 0 || elim.expenses !== 0 || elim.netIncome !== 0;
  const totalRev = rows.reduce((s, r) => s + r.revenueBase, 0) + elim.revenue;
  const totalExp = rows.reduce((s, r) => s + r.expensesBase, 0) + elim.expenses;
  const totalNet = totalRev - totalExp;

  const headers = [
    "Firm entity",
    "Ccy",
    "Revenue (native)",
    "Expenses (native)",
    "Net (native)",
    `Net (${baseCode})`,
  ];
  const out: Array<Record<string, unknown>> = rows.map((r) => ({
    "Firm entity": r.label,
    Ccy: r.ccy,
    "Revenue (native)": money(r.revenueNative),
    "Expenses (native)": money(r.expensesNative),
    "Net (native)": money(r.netNative),
    [`Net (${baseCode})`]: money(r.netBase),
  }));
  if (hasElim) {
    out.push({
      "Firm entity": "Intercompany eliminations",
      Ccy: baseCode,
      "Revenue (native)": money(elim.revenue),
      "Expenses (native)": money(elim.expenses),
      "Net (native)": money(elim.netIncome),
      [`Net (${baseCode})`]: money(elim.netIncome),
    });
  }
  out.push({
    "Firm entity": `Consolidated (${baseCode})`,
    Ccy: baseCode,
    "Revenue (native)": money(totalRev),
    "Expenses (native)": money(totalExp),
    "Net (native)": "",
    [`Net (${baseCode})`]: money(totalNet),
  });

  const body = serializeCsv(headers, out);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="consolidation-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
