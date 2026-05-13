import { NextResponse } from "next/server";
import { ADAPTERS, type CsvTypeKey } from "@/lib/csv-adapters";
import { serializeCsv } from "@/lib/csv";
import { getSessionUser } from "@/lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ type: string; mode: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.isSuperuser) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const { type, mode } = await context.params;
  const adapter = ADAPTERS[type as CsvTypeKey];
  if (!adapter) {
    return NextResponse.json({ error: "unknown type" }, { status: 404 });
  }
  if (mode !== "template" && mode !== "export") {
    return NextResponse.json({ error: "unknown mode" }, { status: 404 });
  }

  const headers = adapter.columns.map((c) => c.name);
  let rows: Array<Record<string, unknown>>;
  if (mode === "template") {
    rows = [adapter.example];
  } else {
    rows = await adapter.load();
  }
  const body = serializeCsv(headers, rows);
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="thistlewood-${type}-${mode}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
