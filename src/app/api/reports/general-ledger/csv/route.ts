import { NextResponse, type NextRequest } from "next/server";

import { serializeCsv } from "@/lib/csv";
import {
  getAccounts,
  getLedgerLinesInRange,
  getSignedBalancesAsOf,
} from "@/lib/data";
import { formatAmount } from "@/lib/money";
import { requirePermission } from "@/lib/permissions";
import { parsePreset, resolvePeriod } from "@/lib/report-periods";
import { getSessionUser } from "@/lib/session";

/** Previous calendar day of an ISO date (for opening balances). */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * General Ledger CSV — per-account activity with opening balance, running
 * balance, and closing balance for the period. Mirrors
 * /reports/general-ledger and honors the ?preset/?from/?to period and
 * ?account filters.
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
  const accountFilter = (sp.get("account") ?? "").trim() || undefined;

  const [lines, accounts, opening] = await Promise.all([
    getLedgerLinesInRange(period.start, period.end, accountFilter),
    getAccounts("all"),
    getSignedBalancesAsOf(dayBefore(period.start), "all"),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));

  const byAccount = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = byAccount.get(l.accountId) ?? [];
    arr.push(l);
    byAccount.set(l.accountId, arr);
  }
  const sectionIds = accountFilter
    ? [accountFilter]
    : [...byAccount.keys()].sort((a, b) =>
        (accountById.get(a)?.code ?? "").localeCompare(
          accountById.get(b)?.code ?? "",
        ),
      );

  const money = (n: number) => (n === 0 ? "" : formatAmount(n, { paren: true }));
  const headers = [
    "Account code",
    "Account",
    "Date",
    "Entry #",
    "Description",
    "Debit",
    "Credit",
    "Balance",
  ];
  const rows: Array<Record<string, unknown>> = [];

  for (const accountId of sectionIds) {
    const acct = accountById.get(accountId);
    const acctLines = byAccount.get(accountId) ?? [];
    const openBal = opening.get(accountId) ?? 0;
    let running = openBal;
    rows.push({
      "Account code": acct?.code ?? "",
      Account: acct?.name ?? accountId,
      Date: period.start,
      "Entry #": "",
      Description: "Opening balance",
      Debit: "",
      Credit: "",
      Balance: formatAmount(openBal, { paren: true }),
    });
    for (const l of acctLines) {
      running += l.debit - l.credit;
      rows.push({
        "Account code": acct?.code ?? "",
        Account: acct?.name ?? accountId,
        Date: l.entryDate,
        "Entry #": l.entryNumber,
        Description: l.lineDescription || l.entryDescription || "",
        Debit: money(l.debit),
        Credit: money(l.credit),
        Balance: formatAmount(running, { paren: true }),
      });
    }
    const periodDebit = acctLines.reduce((s, l) => s + l.debit, 0);
    const periodCredit = acctLines.reduce((s, l) => s + l.credit, 0);
    const closing = openBal + periodDebit - periodCredit;
    rows.push({
      "Account code": acct?.code ?? "",
      Account: acct?.name ?? accountId,
      Date: period.end,
      "Entry #": "",
      Description: "Period activity / closing",
      Debit: formatAmount(periodDebit, { paren: true }),
      Credit: formatAmount(periodCredit, { paren: true }),
      Balance: formatAmount(closing, { paren: true }),
    });
  }

  const body = serializeCsv(headers, rows);
  const suffix = accountFilter
    ? `${accountById.get(accountFilter)?.code ?? accountFilter}-`
    : "";
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="general-ledger-${suffix}${period.start}-to-${period.end}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
