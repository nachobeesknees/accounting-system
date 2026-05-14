import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { IconBuilding } from "@/components/ui/Icon";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getCustomers,
  getEntities,
  getRegionGroups,
  getRegions,
} from "@/lib/data";
import { formatDate } from "@/lib/format";
import type { Entity, EntityKind } from "@/lib/types";

const KIND_LABEL: Record<EntityKind, string> = {
  llc: "LLC",
  trust: "Trust",
  scorp: "S-Corp",
  ccorp: "C-Corp",
  partnership: "Partnership",
  foundation: "Foundation",
  individual: "Individual",
  other: "Other",
};

function filterEntities(
  entities: Entity[],
  q: string,
  kind: string,
  status: string,
  clientId: string,
  regionId: string,
  regionIdsInGroup: Set<string> | null,
): Entity[] {
  const needle = q.trim().toLowerCase();
  return entities.filter((e) => {
    if (kind && e.kind !== kind) return false;
    if (status && e.status !== status) return false;
    if (clientId && e.clientId !== clientId) return false;
    if (regionId && (e.regionId ?? "") !== regionId) return false;
    if (regionIdsInGroup) {
      if (!e.regionId || !regionIdsInGroup.has(e.regionId)) return false;
    }
    if (needle) {
      const hay = `${e.code} ${e.name} ${e.jurisdiction ?? ""} ${e.ein ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kind?: string;
    status?: string;
    client?: string;
    region?: string;
    regionGroup?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const kind = params.kind ?? "";
  const status = params.status ?? "";
  const clientId = params.client ?? "";
  const regionId = params.region ?? "";
  const regionGroupId = params.regionGroup ?? "";

  const [allEntities, customers, regions, regionGroups] = await Promise.all([
    getEntities(),
    getCustomers(),
    getRegions(),
    getRegionGroups(),
  ]);
  const customersById = new Map(customers.map((c) => [c.id, c] as const));
  const regionById = new Map(regions.map((r) => [r.id, r] as const));
  const regionGroupById = new Map(regionGroups.map((g) => [g.id, g] as const));
  // Bucket regions by group for the picker <optgroup>s and group-filter logic.
  const regionsByGroup = new Map<string | null, typeof regions>();
  for (const r of regions) {
    const key = r.groupId ?? null;
    const arr = regionsByGroup.get(key) ?? [];
    arr.push(r);
    regionsByGroup.set(key, arr);
  }
  const regionIdsInGroup =
    regionGroupId && !regionId
      ? new Set((regionsByGroup.get(regionGroupId) ?? []).map((r) => r.id))
      : null;
  const rows = filterEntities(
    allEntities,
    q,
    kind,
    status,
    clientId,
    regionId,
    regionIdsInGroup,
  );

  return (
    <>
      <PageHeader
        title="Entities"
        meta={`${rows.length} of ${allEntities.length} entities`}
        actions={
          <ButtonLink variant="primary" href="/entities/new">
            + New entity
          </ButtonLink>
        }
      />

      <div
        className="px-6 py-2 flex gap-2 flex-wrap items-end"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <form method="GET" className="flex gap-2 flex-wrap items-end">
          <Field
            label="Search"
            name="q"
            placeholder="Code, name, jurisdiction, EIN"
            defaultValue={q}
          />
          <SelectField label="Kind" name="kind" defaultValue={kind}>
            <option value="">All</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectField>
          <SelectField label="Status" name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="dormant">Dormant</option>
            <option value="dissolved">Dissolved</option>
          </SelectField>
          <SelectField label="Client" name="client" defaultValue={clientId}>
            <option value="">All</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Region group"
            name="regionGroup"
            defaultValue={regionGroupId}
          >
            <option value="">All</option>
            {regionGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Region" name="region" defaultValue={regionId}>
            <option value="">All</option>
            {(regionsByGroup.get(null) ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            {regionGroups.map((g) => {
              const rs = regionsByGroup.get(g.id) ?? [];
              if (rs.length === 0) return null;
              return (
                <optgroup key={g.id} label={g.name}>
                  {rs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </SelectField>
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/entities">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card title="Entities">
          {rows.length === 0 ? (
            <Empty
              icon={<IconBuilding size={20} />}
              title={
                allEntities.length === 0
                  ? "No entities yet"
                  : "No entities match these filters"
              }
              body={
                allEntities.length === 0
                  ? "Entities are the legal structures (LLCs, trusts, S-corps, individuals) you keep books for."
                  : "Adjust filters or create a new entity."
              }
              cta={
                <ButtonLink variant="primary" href="/entities/new">
                  + New entity
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Client</TH>
                  <TH>Kind</TH>
                  <TH>Region</TH>
                  <TH>Jurisdiction</TH>
                  <TH>Formation</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((e) => {
                  const client = customersById.get(e.clientId);
                  const region = e.regionId ? regionById.get(e.regionId) : null;
                  const group = region?.groupId
                    ? regionGroupById.get(region.groupId)
                    : null;
                  const regionLabel = region
                    ? group
                      ? `${region.name} · ${group.name}`
                      : region.name
                    : "—";
                  return (
                    <TR key={e.id} href={`/entities/${e.id}`}>
                      <TD mono>
                        <Link
                          href={`/entities/${e.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {e.code}
                        </Link>
                      </TD>
                      <TD>{e.name}</TD>
                      <TD>
                        {client ? (
                          <Link
                            href={`/customers/${client.id}`}
                            style={{ color: "var(--ink)", textDecoration: "none" }}
                          >
                            {client.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                        {KIND_LABEL[e.kind]}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>{regionLabel}</TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {e.jurisdiction ?? "—"}
                      </TD>
                      <TD>{e.formationDate ? formatDate(e.formationDate) : "—"}</TD>
                      <TD>
                        <Pill variant={statusVariant(e.status)}>
                          {statusLabel(e.status)}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
