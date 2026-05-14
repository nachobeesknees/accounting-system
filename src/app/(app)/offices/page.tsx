import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { SmartSelect, type SmartSelectOption } from "@/components/ui/SmartSelect";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getOffices, getPriceLists, getRegionGroups, getRegions } from "@/lib/data";
import { createOfficeAction } from "./actions";
import { setOfficeRegionAction } from "../regions/actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    region?: string;
    regionGroup?: string;
  }>;
}) {
  const { saved, error, region: regionParam, regionGroup: regionGroupParam } =
    await searchParams;
  const regionId = regionParam ?? "";
  const regionGroupId = regionGroupParam ?? "";
  const [allOffices, priceLists, regions, regionGroups] = await Promise.all([
    getOffices(),
    getPriceLists(),
    getRegions(),
    getRegionGroups(),
  ]);
  const plByOffice = new Map<string, number>();
  for (const p of priceLists) {
    plByOffice.set(p.officeId, (plByOffice.get(p.officeId) ?? 0) + 1);
  }
  const groupById = new Map(regionGroups.map((g) => [g.id, g] as const));
  // Regions bucketed by group for <optgroup>.
  const regionsByGroup = new Map<string | null, typeof regions>();
  for (const r of regions) {
    const key = r.groupId ?? null;
    const arr = regionsByGroup.get(key) ?? [];
    arr.push(r);
    regionsByGroup.set(key, arr);
  }
  const orderedGroupIds = regionGroups.map((g) => g.id);
  const regionIdsInGroup =
    regionGroupId && !regionId
      ? new Set((regionsByGroup.get(regionGroupId) ?? []).map((r) => r.id))
      : null;
  const offices = allOffices.filter((o) => {
    if (regionId && (o.regionId ?? "") !== regionId) return false;
    if (regionIdsInGroup) {
      if (!o.regionId || !regionIdsInGroup.has(o.regionId)) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader
        title="Offices"
        meta={`${offices.length} of ${allOffices.length} offices`}
      />

      <div
        className="px-6 py-2 flex gap-2 flex-wrap items-end"
        style={{
          background: "var(--rail)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <form method="GET" className="flex gap-2 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              Region group
            </span>
            <SmartSelect
              name="regionGroup"
              defaultValue={regionGroupId}
              options={regionGroups.map<SmartSelectOption>((g) => ({
                value: g.id,
                label: g.name,
              }))}
              emptyLabel="All"
              clearable
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              Region
            </span>
            <SmartSelect
              name="region"
              defaultValue={regionId}
              options={[
                ...(regionsByGroup.get(null) ?? []).map<SmartSelectOption>(
                  (r) => ({ value: r.id, label: r.name }),
                ),
                ...orderedGroupIds.flatMap<SmartSelectOption>((gid) => {
                  const g = groupById.get(gid);
                  const rs = regionsByGroup.get(gid) ?? [];
                  if (!g) return [];
                  return rs.map((r) => ({
                    value: r.id,
                    label: r.name,
                    group: g.name,
                  }));
                }),
              ]}
              emptyLabel="All"
              clearable
            />
          </div>
          <Button variant="primary" type="submit">
            Apply
          </Button>
          <ButtonLink variant="ghost" href="/offices">
            Reset
          </ButtonLink>
        </form>
      </div>

      <div className="px-6 my-3.5 flex flex-col gap-3.5 pb-8">
        {error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {error}
          </div>
        )}
        {saved && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
              border: "1px solid var(--p-active-fg)",
            }}
          >
            Saved.
          </div>
        )}

        <Card title="Offices">
          {offices.length === 0 ? (
            <Empty title="No offices" body="Add an office below." />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Address</TH>
                  <TH>Region</TH>
                  <TH>Currency</TH>
                  <TH num>Price lists</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {offices.map((o) => (
                  <TR key={o.id}>
                    <TD mono>{o.code}</TD>
                    <TD>{o.name}</TD>
                    <TD style={{ color: "var(--ink-3)" }}>{o.address ?? "—"}</TD>
                    <TD>
                      <form
                        action={setOfficeRegionAction}
                        className="flex items-center gap-1.5"
                      >
                        <input type="hidden" name="officeId" value={o.id} />
                        <div style={{ minWidth: 180, maxWidth: 220 }}>
                          <SmartSelect
                            name="regionId"
                            defaultValue={o.regionId ?? ""}
                            options={[
                              ...(regionsByGroup.get(null) ?? []).map<SmartSelectOption>(
                                (r) => ({ value: r.id, label: r.name }),
                              ),
                              ...orderedGroupIds.flatMap<SmartSelectOption>(
                                (gid) => {
                                  const g = groupById.get(gid);
                                  const rs = regionsByGroup.get(gid) ?? [];
                                  if (!g) return [];
                                  return rs.map((r) => ({
                                    value: r.id,
                                    label: r.name,
                                    group: g.name,
                                  }));
                                },
                              ),
                            ]}
                            emptyLabel="— None —"
                            clearable
                            triggerStyle={{ minHeight: 26, fontSize: 12 }}
                          />
                        </div>
                        <Button variant="ghost" type="submit">
                          Save
                        </Button>
                      </form>
                    </TD>
                    <TD mono>{o.currencyCode}</TD>
                    <TD num>
                      <Link
                        href={`/price-lists?office=${o.id}`}
                        style={{ color: "var(--ink-3)" }}
                      >
                        {plByOffice.get(o.id) ?? 0}
                      </Link>
                    </TD>
                    <TD>
                      <Pill variant={statusVariant(o.isActive ? "active" : "inactive")}>
                        {statusLabel(o.isActive ? "active" : "inactive")}
                      </Pill>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={createOfficeAction}>
          <Card title="Add office">
            <div className="flex flex-col gap-3">
              <Row>
                <Field label="Code" name="code" required mono placeholder="OFC-XX" />
                <Field
                  label="Name"
                  name="name"
                  required
                  placeholder="Thistlewood — City"
                />
              </Row>
              <Row>
                <Field label="Address" name="address" />
                <Field label="Currency" name="currencyCode" mono maxLength={3} defaultValue="USD" />
              </Row>
              <Row>
                <div className="flex flex-col gap-1">
                  <span
                    className="text-[11.5px]"
                    style={{ color: "var(--ink-3)" }}
                  >
                    Status
                  </span>
                  <SmartSelect
                    name="isActive"
                    defaultValue="on"
                    options={[
                      { value: "on", label: "Active" },
                      { value: "", label: "Inactive" },
                    ]}
                  />
                </div>
                <Field label="Notes" name="notes" />
              </Row>
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Add office
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
