import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getOffices, getPriceLists, getRegionGroups, getRegions } from "@/lib/data";
import { createOfficeAction } from "./actions";
import { setOfficeRegionAction } from "../regions/actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const [offices, priceLists, regions, regionGroups] = await Promise.all([
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

  return (
    <>
      <PageHeader title="Offices" meta={`${offices.length} offices`} />

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
                        <select
                          name="regionId"
                          defaultValue={o.regionId ?? ""}
                          className="px-2 py-1 rounded-md outline-none"
                          style={{
                            background: "var(--paper)",
                            border: "1px solid var(--line-2)",
                            color: "var(--ink)",
                            fontSize: 12,
                            maxWidth: 220,
                          }}
                        >
                          <option value="">— None —</option>
                          {(regionsByGroup.get(null) ?? []).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                          {orderedGroupIds.map((gid) => {
                            const g = groupById.get(gid);
                            const rs = regionsByGroup.get(gid) ?? [];
                            if (!g || rs.length === 0) return null;
                            return (
                              <optgroup key={gid} label={g.name}>
                                {rs.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
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
                <SelectField label="Status" name="isActive" defaultValue="on">
                  <option value="on">Active</option>
                  <option value="">Inactive</option>
                </SelectField>
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
