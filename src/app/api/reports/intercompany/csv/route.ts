import { NextResponse } from "next/server";

import { serializeCsv } from "@/lib/csv";
import {
  getBaseCurrency,
  getFirmEntities,
  getIntercompanyLinesDetailed,
  type IntercompanyLineDetail,
} from "@/lib/data";
import { formatAmount } from "@/lib/money";
import { requirePermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toBase(l: IntercompanyLineDetail): number {
  const nat = l.debit - l.credit;
  return l.fxRate != null && l.fxRate > 0 ? nat / l.fxRate : nat;
}

/**
 * Intercompany CSV — every posted journal line carrying a counterpart tag,
 * with from/to entity and the base-currency amount. This is the detailed
 * underlying data the /reports/intercompany matrix is built from (the same
 * rows shown in the per-pair drill-down tables).
 */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    requirePermission(user, "report.export_csv");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [firmEntities, lines, base] = await Promise.all([
    getFirmEntities(),
    getIntercompanyLinesDetailed(),
    getBaseCurrency(),
  ]);
  const baseCode = base?.code ?? "USD";
  const firmById = new Map(firmEntities.map((e) => [e.id, e] as const));
  const label = (id: string | null): string => {
    if (!id) return "Firm-level";
    const e = firmById.get(id);
    return e ? `${e.code} — ${e.name}` : id;
  };

  const headers = [
    "Date",
    "Entry #",
    "From entity",
    "To (counterpart) entity",
    "Account code",
    "Account",
    "Description",
    "Debit",
    "Credit",
    `Base (${baseCode})`,
  ];
  const rows = lines.map((l) => ({
    Date: l.entryDate,
    "Entry #": l.entryNumber,
    "From entity": label(l.fromEntityId),
    "To (counterpart) entity": label(l.toEntityId),
    "Account code": l.accountCode,
    Account: l.accountName,
    Description: l.lineDescription || l.entryDescription || "",
    Debit: l.debit === 0 ? "" : formatAmount(l.debit, { paren: true }),
    Credit: l.credit === 0 ? "" : formatAmount(l.credit, { paren: true }),
    [`Base (${baseCode})`]: formatAmount(round2(toBase(l)), { paren: true }),
  }));

  const body = serializeCsv(headers, rows);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="intercompany-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
