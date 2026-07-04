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
import { SortableTH } from "@/components/ui/SortableTH";
import { parseSort } from "@/lib/list-params";
import { SavedViews } from "@/components/SavedViews";
import {
  getCustomers,
  getInvoices,
  getRegionGroups,
  getRegions,
  getSavedViews,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { formatMoney, parseAmount } from "@/lib/money";
import {
  KYC_STATUS_LABELS,
  isKycOverdue,
  kycStatusVariant,
} from "@/lib/compliance";
import type { Customer } from "@/lib/types";

const CUSTOMER_SORT_COLUMNS = [
  "code",
  "name",
  "email",
  "terms",
  "balance",
  "status",
] as const;
type CustomerSortCol = (typeof CUSTOMER_SORT_COLUMNS)[number];

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
  searchParams: Promise<{
    q?: string;
    region?: string;
    regionGroup?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const regionId = params.region ?? "";
  const regionGroupId = params.regionGroup ?? "";
  const { col: sortCol, dir: sortDir } = parseSort<CustomerSortCol>(
    params.sort,
    params.dir,
    CUSTOMER_SORT_COLUMNS,
  );

  const user = await getSessionUser();
  const [allCustomers, allInvoices, regions, regionGroups, savedViews] =
    await Promise.all([
      getCustomers(),
      getInvoices(),
      getRegions(),
      getRegionGroups(),
      user ? getSavedViews(user.userId, "/customers") : Promise.resolve([]),
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
  const filtered = filterCustomers(
    allCustomers,
    q,
    regionId,
    regionIdsInGroup,
  );

  const balanceFor = (customerId: string): number =>
    allInvoices
      .filter((inv) => inv.customerId === customerId)
      .reduce((s, inv) => s + parseAmount(inv.balanceDue), 0);

  const balances = new Map(
    filtered.map((c) => [c.id, balanceFor(c.id)] as const),
  );
  const factor = sortDir === "asc" ? 1 : -1;
  const rows = sortCol
    ? filtered.slice().sort((a, b) => {
        let c = 0;
        switch (sortCol) {
          case "code":
            c = a.code.localeCompare(b.code);
            break;
          case "name":
            c = a.name.localeCompare(b.name);
            break;
          case "email":
            c = (a.email ?? "").localeCompare(b.email ?? "");
            break;
          case "terms":
            c = a.paymentTerms - b.paymentTerms;
            break;
          case "balance":
            c = (balances.get(a.id) ?? 0) - (balances.get(b.id) ?? 0);
            break;
          case "status":
            c = Number(a.isActive) - Number(b.isActive);
            break;
        }
        return factor * c;
      })
    : filtered.slice().sort((a, b) => a.code.localeCompare(b.code));

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
          {sortCol && <input type="hidden" name="sort" value={sortCol} />}
          {sortCol && <input type="hidden" name="dir" value={sortDir} />}
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/customers">
            Reset
          </ButtonLink>
        </form>
        {user && <SavedViews route="/customers" views={savedViews} />}
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
                  <SortableTH col="code">Code</SortableTH>
                  <SortableTH col="name">Name</SortableTH>
                  <SortableTH col="email">Email</SortableTH>
                  <TH>Phone</TH>
                  <TH>Region</TH>
                  <TH>KYC</TH>
                  <SortableTH col="terms" num>
                    Terms
                  </SortableTH>
                  <SortableTH col="balance" num>
                    Balance (USD)
                  </SortableTH>
                  <SortableTH col="status">Status</SortableTH>
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
                      <TD>
                        {isKycOverdue(c.kycNextReviewDate) ? (
                          <Pill variant="review">Overdue</Pill>
                        ) : (
                          <Pill variant={kycStatusVariant(c.kycStatus ?? "not_started")}>
                            {KYC_STATUS_LABELS[c.kycStatus ?? "not_started"]}
                          </Pill>
                        )}
                      </TD>
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
