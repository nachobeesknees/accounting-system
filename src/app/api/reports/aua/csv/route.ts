import { NextResponse, type NextRequest } from "next/server";

import { serializeCsv } from "@/lib/csv";
import {
  convertToBase,
  getAssets,
  getBaseCurrency,
  getCustomers,
  getEntities,
  getLatestFxRates,
  getLatestSnapshotByAssetAsOf,
} from "@/lib/data";
import { formatAmount, parseAmount } from "@/lib/money";
import { requirePermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";
import type { AssetKind } from "@/lib/types";

const KIND_LABEL: Record<AssetKind, string> = {
  real_estate: "Real Estate",
  securities: "Securities",
  cash: "Cash",
  bank_account: "Bank Account",
  private_equity: "Private Equity",
  art: "Art",
  vehicle: "Vehicle",
  business_interest: "Business Interest",
  intellectual_property: "IP",
  other: "Other",
};

function isValidIsoDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Assets Under Administration CSV — the "All assets" table valued at the
 * latest snapshot on or before ?asOf, converted to base. Mirrors /aua.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    requirePermission(user, "report.export_csv");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const asOfParam = request.nextUrl.searchParams.get("asOf");
  const asOf = isValidIsoDate(asOfParam) ? asOfParam : today;

  const [assets, latestByAsset, entities, customers, base, fxRates] =
    await Promise.all([
      getAssets(),
      getLatestSnapshotByAssetAsOf(asOf),
      getEntities(),
      getCustomers(),
      getBaseCurrency(),
      getLatestFxRates(),
    ]);
  const baseCode = base?.code ?? "USD";
  const entityById = new Map(entities.map((e) => [e.id, e] as const));
  const customerById = new Map(customers.map((c) => [c.id, c] as const));

  const sorted = assets
    .map((a) => {
      const snap = latestByAsset.get(a.id);
      const nativeValue = snap ? parseAmount(snap.value) : 0;
      const ccy = snap?.currencyCode || a.currencyCode || baseCode;
      const baseValue =
        snap == null
          ? 0
          : ccy === baseCode
            ? nativeValue
            : (convertToBase(nativeValue, ccy, fxRates) ?? 0);
      return { asset: a, nativeValue, baseValue, ccy, snap };
    })
    .sort((a, b) => b.baseValue - a.baseValue);

  const headers = [
    "Asset",
    "Entity",
    "Client",
    "Class",
    "Latest snapshot",
    "Native currency",
    "Native value",
    `Value (${baseCode})`,
  ];
  const rows = sorted.map(({ asset, nativeValue, baseValue, ccy, snap }) => {
    const entity = asset.entityId ? entityById.get(asset.entityId) : undefined;
    const client = entity
      ? customerById.get(entity.clientId)
      : asset.clientId
        ? customerById.get(asset.clientId)
        : undefined;
    return {
      Asset: asset.name,
      Entity: entity ? entity.code : asset.clientId ? "DIRECT" : "",
      Client: client?.name ?? "",
      Class: KIND_LABEL[asset.kind],
      "Latest snapshot": snap ? snap.snapshotDate : "No snapshot",
      "Native currency": snap ? ccy : "",
      "Native value": snap ? formatAmount(nativeValue, { paren: true }) : "",
      [`Value (${baseCode})`]: snap
        ? formatAmount(baseValue, { paren: true })
        : "",
    };
  });
  const totalAua = sorted.reduce((s, r) => s + r.baseValue, 0);
  rows.push({
    Asset: "Total AUA",
    Entity: "",
    Client: "",
    Class: "",
    "Latest snapshot": "",
    "Native currency": "",
    "Native value": "",
    [`Value (${baseCode})`]: formatAmount(totalAua, { paren: true }),
  });

  const body = serializeCsv(headers, rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aua-${asOf}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
