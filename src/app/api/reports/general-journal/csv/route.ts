import { NextResponse, type NextRequest } from "next/server";

import { serializeCsv } from "@/lib/csv";
import { getAccounts, getLedgerLinesInRange } from "@/lib/data";
import { formatAmount } from "@/lib/money";
import { requirePermission } from "@/lib/permissions";
import { parsePreset, resolvePeriod } from "@/lib/report-periods";
import { getSessionUser } from "@/lib/session";

/**
 * General Journal CSV — every posted journal line in the period, in
 * chronological entry order. Mirrors /reports/general-journal (consolidated
 * across firm entities). Honors the same ?preset/?from/?to period filters.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    requirePermission(user, "report.export_csv");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const period = resolvePeriod(
    parsePreset(sp.get("preset")),
    new Date(),
    sp.get("from") ?? undefined,
    sp.get("to") ?? undefined,
  );

  const [lines, accounts] = await Promise.all([
    getLedgerLinesInRange(period.start, period.end),
    getAccounts("all"),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));
  const money = (n: number) =>
    n === 0 ? "" : formatAmount(n, { paren: true });

  const headers = [
    "Date",
    "Entry #",
    "Account code",
    "Account",
    "Description",
    "Debit",
    "Credit",
  ];
  const rows = lines.map((l) => {
    const acct = accountById.get(l.accountId);
    return {
      Date: l.entryDate,
      "Entry #": l.entryNumber,
      "Account code": acct?.code ?? "",
      Account: acct?.name ?? l.accountId,
      Description: l.lineDescription || l.entryDescription || "",
      Debit: money(l.debit),
      Credit: money(l.credit),
    };
  });
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  rows.push({
    Date: "",
    "Entry #": "",
    "Account code": "",
    Account: "Totals",
    Description: "",
    Debit: formatAmount(totalDebit, { paren: true }),
    Credit: formatAmount(totalCredit, { paren: true }),
  });

  const body = serializeCsv(headers, rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="general-journal-${period.start}-to-${period.end}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
