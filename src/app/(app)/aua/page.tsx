import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  convertToBase,
  getAssets,
  getBaseCurrency,
  getCustomers,
  getEntities,
  getLatestFxRates,
  getLatestSnapshotByAsset,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatAmount, parseAmount } from "@/lib/money";
import type { AssetKind } from "@/lib/types";

const KIND_LABEL: Record<AssetKind, string> = {
  real_estate: "Real Estate",
  securities: "Securities",
  cash: "Cash",
  private_equity: "Private Equity",
  art: "Art",
  vehicle: "Vehicle",
  business_interest: "Business Interest",
  intellectual_property: "IP",
  other: "Other",
};

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-lg p-3.5"
      style={{
        border: "1px solid var(--line)",
        background: "var(--raised)",
      }}
    >
      <div
        className="uppercase"
        style={{ fontSize: 10.5, letterSpacing: "0.04em", color: "var(--ink-3)" }}
      >
        {label}
      </div>
      <div
        className="mt-1"
        style={{
          fontSize: 22,
          color: "var(--ink)",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default async function Page() {
  const [assets, latestByAsset, entities, customers, base, fxRates] =
    await Promise.all([
      getAssets(),
      getLatestSnapshotByAsset(),
      getEntities(),
      getCustomers(),
      getBaseCurrency(),
      getLatestFxRates(),
    ]);
  const baseCode = base?.code ?? "USD";
  const baseSymbol = base?.symbol ?? "$";
  const entityById = new Map(entities.map((e) => [e.id, e] as const));
  const customerById = new Map(customers.map((c) => [c.id, c] as const));

  // Rollups — all values normalised to base currency
  let totalAua = 0;
  let unconverted = 0; // sum of values we couldn't FX-convert
  const byClient = new Map<string, number>();
  const byEntity = new Map<string, number>();
  const byKind = new Map<AssetKind, number>();
  for (const a of assets) {
    const snap = latestByAsset.get(a.id);
    if (!snap) continue;
    const raw = parseAmount(snap.value);
    const ccy = snap.currencyCode || a.currencyCode || baseCode;
    const converted =
      ccy === baseCode ? raw : convertToBase(raw, ccy, fxRates);
    if (converted == null) {
      unconverted += raw;
      continue;
    }
    totalAua += converted;
    // Ownership chain: prefer entity wrapper, else fall back to direct client hold.
    if (a.entityId) {
      byEntity.set(a.entityId, (byEntity.get(a.entityId) ?? 0) + converted);
      const ent = entityById.get(a.entityId);
      if (ent) {
        byClient.set(ent.clientId, (byClient.get(ent.clientId) ?? 0) + converted);
      }
    } else if (a.clientId) {
      byClient.set(a.clientId, (byClient.get(a.clientId) ?? 0) + converted);
    }
    byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + converted);
  }
  const formatBase = (n: number) =>
    `${baseSymbol}${formatAmount(n, { paren: true })}`;

  const sortedClients = customers
    .map((c) => ({ client: c, total: byClient.get(c.id) ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const sortedAssets = assets
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
  const stalest = [...sortedAssets]
    .filter((row) => row.snap)
    .sort((a, b) =>
      a.snap!.snapshotDate.localeCompare(b.snap!.snapshotDate),
    )
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Assets Under Administration"
        meta={`${assets.length} assets across ${entities.length} entities`}
        actions={
          <ButtonLink variant="primary" href="/aua/new">
            + New asset
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 px-6 my-3.5">
        <Tile
          label={`Total AUA (${baseCode})`}
          value={formatBase(totalAua)}
          sub={
            unconverted > 0
              ? `${formatBase(unconverted)} unconverted (missing FX rate)`
              : "Latest snapshot per asset, converted to base"
          }
        />
        <Tile
          label="Top client AUA"
          value={
            sortedClients[0]
              ? formatBase(sortedClients[0].total)
              : "—"
          }
          sub={sortedClients[0]?.client.name}
        />
        <Tile
          label="Real estate %"
          value={
            totalAua > 0
              ? `${(((byKind.get("real_estate") ?? 0) / totalAua) * 100).toFixed(1)}%`
              : "—"
          }
          sub="Of total AUA"
        />
        <Tile
          label="Stalest snapshot"
          value={stalest[0]?.snap?.snapshotDate ?? "—"}
          sub={stalest[0]?.asset.name ?? ""}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 px-6 mb-3.5">
        <Card title="AUA by client">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Client</TH>
                <TH num>AUA</TH>
                <TH num>%</TH>
              </TR>
            </THead>
            <TBody>
              {sortedClients.map(({ client, total }) => (
                <TR key={client.id}>
                  <TD>
                    <Link
                      href={`/customers/${client.id}`}
                      style={{ color: "var(--ink)", textDecoration: "none" }}
                    >
                      {client.name}
                    </Link>
                  </TD>
                  <TD num>{formatBase(total)}</TD>
                  <TD num style={{ color: "var(--ink-3)" }}>
                    {totalAua > 0 ? `${((total / totalAua) * 100).toFixed(1)}%` : "—"}
                  </TD>
                </TR>
              ))}
              <TR total hover={false}>
                <TD>Total ({baseCode})</TD>
                <TD num>{formatBase(totalAua)}</TD>
                <TD num>100.0%</TD>
              </TR>
            </TBody>
          </Table>
        </Card>

        <Card title="AUA by asset class">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Class</TH>
                <TH num>AUA</TH>
                <TH num>%</TH>
              </TR>
            </THead>
            <TBody>
              {Array.from(byKind.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <TR key={k}>
                    <TD>{KIND_LABEL[k]}</TD>
                    <TD num>{formatBase(v)}</TD>
                    <TD num style={{ color: "var(--ink-3)" }}>
                      {totalAua > 0 ? `${((v / totalAua) * 100).toFixed(1)}%` : "—"}
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <div className="px-6 pb-8">
        <Card
          title="All assets"
          actions={
            <ButtonLink variant="ghost" href="/aua/new">
              + New asset
            </ButtonLink>
          }
        >
          {assets.length === 0 ? (
            <Empty
              title="No assets yet"
              body="Track real estate, securities, art and more under each entity."
              cta={
                <ButtonLink variant="primary" href="/aua/new">
                  + New asset
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Asset</TH>
                  <TH>Entity</TH>
                  <TH>Client</TH>
                  <TH>Class</TH>
                  <TH>Latest snapshot</TH>
                  <TH num>Native value</TH>
                  <TH num>In {baseCode}</TH>
                </TR>
              </THead>
              <TBody>
                {sortedAssets.map(({ asset, nativeValue, baseValue, ccy, snap }) => {
                  const entity = asset.entityId
                    ? entityById.get(asset.entityId)
                    : undefined;
                  const client = entity
                    ? customerById.get(entity.clientId)
                    : asset.clientId
                      ? customerById.get(asset.clientId)
                      : undefined;
                  const directHold = !entity && !!asset.clientId;
                  return (
                    <TR key={asset.id} href={`/aua/${asset.id}`}>
                      <TD>
                        <Link
                          href={`/aua/${asset.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {asset.name}
                        </Link>
                      </TD>
                      <TD>
                        {entity ? (
                          <Link
                            href={`/entities/${entity.id}`}
                            style={{ color: "var(--ink)", textDecoration: "none" }}
                          >
                            {entity.code}
                          </Link>
                        ) : directHold ? (
                          <span
                            style={{
                              color: "var(--p-formation-fg)",
                              fontSize: 10.5,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "var(--p-formation-bg)",
                            }}
                          >
                            DIRECT
                          </span>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>{client?.name ?? "—"}</TD>
                      <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                        {KIND_LABEL[asset.kind]}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {snap ? formatDate(snap.snapshotDate) : "No snapshot"}
                      </TD>
                      <TD num>
                        {snap ? `${ccy} ${formatAmount(nativeValue, { paren: true })}` : "—"}
                      </TD>
                      <TD num>{snap ? formatBase(baseValue) : "—"}</TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD colSpan={5}>Total AUA</TD>
                  <TD num>{""}</TD>
                  <TD num>{formatBase(totalAua)}</TD>
                </TR>
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
