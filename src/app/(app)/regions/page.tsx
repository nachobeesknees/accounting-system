import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, SelectField } from "@/components/ui/Field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getFirmEntities, getRegionGroups, getRegions } from "@/lib/data";
import {
  createRegionAction,
  createRegionGroupAction,
  deleteRegionAction,
  deleteRegionGroupAction,
  updateRegionAction,
  updateRegionGroupAction,
} from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    editGroup?: string;
    editRegion?: string;
  }>;
}) {
  const { saved, error, editGroup, editRegion } = await searchParams;
  const [groups, regions, offices] = await Promise.all([
    getRegionGroups(),
    getRegions(),
    getFirmEntities(),
  ]);

  // Counts.
  const regionsByGroup = new Map<string, number>();
  for (const r of regions) {
    if (r.groupId) {
      regionsByGroup.set(r.groupId, (regionsByGroup.get(r.groupId) ?? 0) + 1);
    }
  }
  const officesByRegion = new Map<string, number>();
  for (const o of offices) {
    if (o.regionId) {
      officesByRegion.set(o.regionId, (officesByRegion.get(o.regionId) ?? 0) + 1);
    }
  }
  // Offices per group = sum of offices per region whose groupId matches.
  const officesByGroup = new Map<string, number>();
  for (const r of regions) {
    if (!r.groupId) continue;
    const c = officesByRegion.get(r.id) ?? 0;
    officesByGroup.set(r.groupId, (officesByGroup.get(r.groupId) ?? 0) + c);
  }

  const groupById = new Map(groups.map((g) => [g.id, g] as const));

  return (
    <>
      <PageHeader
        title="Regions"
        meta={`${groups.length} groups · ${regions.length} regions · ${offices.length} offices`}
      />

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

        {/* ---- Region groups ---- */}
        <Card title="Region groups">
          {groups.length === 0 ? (
            <Empty
              title="No region groups"
              body="Region groups are the top-level bucket — Americas, EMEA, APAC. Add one below."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Name</TH>
                  <TH num>Regions</TH>
                  <TH num>Offices</TH>
                  <TH>{""}</TH>
                </TR>
              </THead>
              <TBody>
                {groups.map((g) => {
                  const editing = editGroup === g.id;
                  return (
                    <TR key={g.id}>
                      {editing ? (
                        <TD colSpan={4}>
                          <form
                            action={updateRegionGroupAction}
                            className="flex items-end gap-2"
                          >
                            <input type="hidden" name="id" value={g.id} />
                            <Field
                              label="Name"
                              name="name"
                              defaultValue={g.name}
                              required
                              autoFocus
                            />
                            <Button variant="primary" type="submit">
                              Save
                            </Button>
                            <Link
                              href="/regions"
                              className="px-3 py-1.5 text-[12.5px] rounded-md"
                              style={{ color: "var(--ink-3)" }}
                            >
                              Cancel
                            </Link>
                          </form>
                        </TD>
                      ) : (
                        <>
                          <TD>{g.name}</TD>
                          <TD num>{regionsByGroup.get(g.id) ?? 0}</TD>
                          <TD num>{officesByGroup.get(g.id) ?? 0}</TD>
                          <TD>
                            <div className="flex gap-2">
                              <Link
                                href={`/regions?editGroup=${g.id}`}
                                className="text-[12.5px]"
                                style={{ color: "var(--ink-3)" }}
                              >
                                Rename
                              </Link>
                              <form action={deleteRegionGroupAction}>
                                <input type="hidden" name="id" value={g.id} />
                                <Button variant="ghost" type="submit">
                                  Delete
                                </Button>
                              </form>
                            </div>
                          </TD>
                        </>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
          <form action={createRegionGroupAction}>
            <div
              className="flex items-end gap-2 px-3 py-2.5"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <Field
                label="+ New region group"
                name="name"
                placeholder="e.g. Americas"
                required
              />
              <Button variant="primary" type="submit">
                Save
              </Button>
            </div>
          </form>
        </Card>

        {/* ---- Regions ---- */}
        <Card title="Regions">
          {regions.length === 0 ? (
            <Empty
              title="No regions"
              body="Regions sit between offices and region groups. Add one below."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Name</TH>
                  <TH>Group</TH>
                  <TH num>Offices</TH>
                  <TH>{""}</TH>
                </TR>
              </THead>
              <TBody>
                {regions.map((r) => {
                  const editing = editRegion === r.id;
                  const group = r.groupId ? groupById.get(r.groupId) : undefined;
                  return (
                    <TR key={r.id}>
                      {editing ? (
                        <TD colSpan={4}>
                          <form
                            action={updateRegionAction}
                            className="flex items-end gap-2 flex-wrap"
                          >
                            <input type="hidden" name="id" value={r.id} />
                            <Field
                              label="Name"
                              name="name"
                              defaultValue={r.name}
                              required
                              autoFocus
                            />
                            <SelectField
                              label="Group"
                              name="groupId"
                              defaultValue={r.groupId ?? ""}
                            >
                              <option value="">— No group —</option>
                              {groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </SelectField>
                            <Button variant="primary" type="submit">
                              Save
                            </Button>
                            <Link
                              href="/regions"
                              className="px-3 py-1.5 text-[12.5px] rounded-md"
                              style={{ color: "var(--ink-3)" }}
                            >
                              Cancel
                            </Link>
                          </form>
                        </TD>
                      ) : (
                        <>
                          <TD>{r.name}</TD>
                          <TD style={{ color: "var(--ink-3)" }}>
                            {group?.name ?? "—"}
                          </TD>
                          <TD num>{officesByRegion.get(r.id) ?? 0}</TD>
                          <TD>
                            <div className="flex gap-2">
                              <Link
                                href={`/regions?editRegion=${r.id}`}
                                className="text-[12.5px]"
                                style={{ color: "var(--ink-3)" }}
                              >
                                Edit
                              </Link>
                              <form action={deleteRegionAction}>
                                <input type="hidden" name="id" value={r.id} />
                                <Button variant="ghost" type="submit">
                                  Delete
                                </Button>
                              </form>
                            </div>
                          </TD>
                        </>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
          <form action={createRegionAction}>
            <div
              className="flex items-end gap-2 px-3 py-2.5 flex-wrap"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <Field
                label="+ New region"
                name="name"
                placeholder="e.g. North America"
                required
              />
              <SelectField label="Group" name="groupId" defaultValue="">
                <option value="">— No group —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </SelectField>
              <Button variant="primary" type="submit">
                Save
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
