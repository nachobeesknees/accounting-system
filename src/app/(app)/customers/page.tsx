import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field } from "@/components/ui/Field";
import { SmartSelectField, type SmartSelectOption } from "@/components/ui/SmartSelect";
import { IconUsers } from "@/components/ui/Icon";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getCustomers,
  getInvoices,
  getRegionGroups,
  getRegions,
} from "@/lib/data";
import { formatMoney, parseAmount } from "@/lib/money";
import type { Customer } from "@/lib/types";

function filterCustomers(
  customers: Customer[],
  q: string,
  regionId: string,
  regionIdsInGroup: Set<string> | null,
): Customer[] {
  const needle = q.trim().toLowerCase();
  return customers.filter((c) => {
    const cr = (c as { regionId?: string | null }).regionId ?? "";
    if (regionId && cr !== regionId) return false;
    if (regionIdsInGroup) {
      if (!cr || !regionIdsInGroup.has(cr)) return false;
    }
    if (needle) {
      const hay = `${c.code} ${c.name} ${c.email ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; region?: string; regionGroup?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const regionId = params.region ?? "";
  const regionGroupId = params.regionGroup ?? "";

  const [allCustomers, allInvoices, regions, regionGroups] = await Promise.all([
    getCustomers(),
    getInvoices(),
    getRegions(),
    getRegionGroups(),
  ]);
  const regionGroupById = new Map(regionGroups.map((g) => [g.id, g] as const));
  const regionsByGroup = new Map<string | null, typeof regions>();
  for (const r of regions) {
    const key = r.groupId ?? null;
    const arr = regionsByGroup.get(key) ?? [];
    arr.push(r);
    regionsByGroup.set(key, arr);
  }
  const orderedRegionGroupIds = regionGroups.map((g) => g.id);
  const regionNameById = new Map(regions.map((r) => [r.id, r.name] as const));
  const regionIdsInGroup =
    regionGroupId && !regionId
      ? new Set((regionsByGroup.get(regionGroupId) ?? []).map((r) => r.id))
      : null;
  const rows = filterCustomers(allCustomers, q, regionId, regionIdsInGroup)
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));

  const balanceFor = (customerId: string): number =>
    allInvoices
      .filter((inv) => inv.customerId === customerId)
      .reduce((s, inv) => s + parseAmount(inv.balanceDue), 0);

  const balances = new Map(rows.map((c) => [c.id, balanceFor(c.id)] as const));
  const balanceTotal = Array.from(balances.values()).reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader
        title="Clients"
        meta={`${rows.length} active`}
        actions={
          <ButtonLink variant="primary" href="/customers/new">
            + New client
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
            placeholder="Code, name, or email"
            defaultValue={q}
          />
          <SmartSelectField
            label="Region group"
            name="regionGroup"
            defaultValue={regionGroupId}
            options={regionGroups.map((g) => ({ value: g.id, label: g.name }))}
            emptyLabel="All"
            clearable
          />
          <SmartSelectField
            label="Region"
            name="region"
            defaultValue={regionId}
            options={[
              ...(regionsByGroup.get(null) ?? []).map<SmartSelectOption>((r) => ({
                value: r.id,
                label: r.name,
              })),
              ...orderedRegionGroupIds.flatMap<SmartSelectOption>((gid) => {
                const g = regionGroupById.get(gid);
                const rs = regionsByGroup.get(gid) ?? [];
                if (!g) return [];
                return rs.map((r) => ({
                  value: r.id,
                  label: r.name,
                  group: g.name,
                }));
              }),
            ]}
            emptyLabel="All regions"
            clearable
          />
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/customers">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 py-3.5 pb-8">
        <Card title="Clients">
          {rows.length === 0 ? (
            <Empty
              icon={<IconUsers size={20} />}
              title={
                allCustomers.length === 0
                  ? "No clients yet"
                  : "No clients match your search"
              }
              body={
                allCustomers.length === 0
                  ? "Clients are the families or organizations you serve. Each one owns one or more entities you keep books for."
                  : "Try a different query or add a new client."
              }
              cta={
                <ButtonLink variant="primary" href="/customers/new">
                  + New client
                </ButtonLink>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Phone</TH>
                  <TH>Region</TH>
                  <TH num>Terms</TH>
                  <TH num>Balance (USD)</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((c) => {
                  const balance = balances.get(c.id) ?? 0;
                  const statusKey = c.isActive ? "active" : "inactive";
                  const cRegionId =
                    (c as { regionId?: string | null }).regionId ?? null;
                  const regionName = cRegionId
                    ? regionNameById.get(cRegionId) ?? "—"
                    : "—";
                  return (
                    <TR key={c.id} href={`/customers/${c.id}`}>
                      <TD mono>
                        <Link
                          href={`/customers/${c.id}`}
                          style={{ color: "var(--ink)", textDecoration: "none" }}
                        >
                          {c.code}
                        </Link>
                      </TD>
                      <TD>{c.name}</TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {c.email ?? "—"}
                      </TD>
                      <TD
                        mono
                        style={{ color: "var(--ink-3)" }}
                      >
                        {c.phone ?? "—"}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>{regionName}</TD>
                      <TD num>{`Net ${c.paymentTerms}`}</TD>
                      <TD num>{formatMoney(balance, "USD", { paren: true, compact: true, hideCurrency: true })}</TD>
                      <TD>
                        <Pill variant={statusVariant(statusKey)}>
                          {statusLabel(statusKey)}
                        </Pill>
                      </TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD>Total</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD>{""}</TD>
                  <TD num>{formatMoney(balanceTotal, "USD", { paren: true, compact: true, hideCurrency: true })}</TD>
                  <TD>{""}</TD>
                </TR>
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
