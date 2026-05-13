import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getAllLookupValues,
  getLookupTableByKey,
  getLookupTables,
} from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import {
  addValueAction,
  createTableAction,
  deleteTableAction,
  deleteValueAction,
  updateValueAction,
} from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; saved?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { table: tableKey, saved, error } = await searchParams;

  if (!user.isSuperuser) {
    return (
      <>
        <PageHeader title="Lookups" meta="Admin only" />
        <div className="px-6 my-3.5">
          <Card title="Restricted">
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              Lookup-table editing is admin-only. Ask a superuser to make changes.
            </p>
          </Card>
        </div>
      </>
    );
  }

  const [tables, allValues] = await Promise.all([
    getLookupTables(),
    getAllLookupValues(),
  ]);
  const valuesByTable = new Map<string, typeof allValues>();
  for (const v of allValues) {
    const arr = valuesByTable.get(v.tableKey) ?? [];
    arr.push(v);
    valuesByTable.set(v.tableKey, arr);
  }
  const activeTable = tableKey ? await getLookupTableByKey(tableKey) : undefined;
  const activeValues = activeTable ? (valuesByTable.get(activeTable.key) ?? []) : [];

  return (
    <>
      <PageHeader
        title="Lookup tables"
        meta={`${tables.length} tables · ${allValues.length} values`}
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

        <Card title="Tables">
          {tables.length === 0 ? (
            <Empty title="No lookup tables" body="Create one below." />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Key</TH>
                  <TH>Label</TH>
                  <TH num>Values</TH>
                  <TH>System</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {tables.map((t) => (
                  <TR key={t.key}>
                    <TD mono>
                      <Link
                        href={`/settings/lookups?table=${t.key}`}
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {t.key}
                      </Link>
                    </TD>
                    <TD>{t.label}</TD>
                    <TD num>{(valuesByTable.get(t.key) ?? []).length}</TD>
                    <TD>
                      {t.isSystem ? (
                        <Pill variant="formation">System</Pill>
                      ) : (
                        <Pill variant="neutral">Custom</Pill>
                      )}
                    </TD>
                    <TD>
                      {!t.isSystem && (
                        <form action={deleteTableAction}>
                          <input type="hidden" name="key" value={t.key} />
                          <Button variant="ghost" type="submit">
                            Remove
                          </Button>
                        </form>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={createTableAction}>
          <Card title="New lookup table">
            <div className="flex flex-col gap-3">
              <Row>
                <Field label="Key" name="key" required mono placeholder="document_type" />
                <Field label="Label" name="label" required placeholder="Document types" />
              </Row>
              <Field label="Description" name="description" />
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Create table
                </Button>
              </div>
            </div>
          </Card>
        </form>

        {activeTable && (
          <Card
            title={`Values — ${activeTable.label}`}
            actions={
              <ButtonLink href="/settings/lookups" variant="ghost">
                Clear filter
              </ButtonLink>
            }
          >
            {activeValues.length === 0 ? (
              <Empty title="No values" body="Add one below." />
            ) : (
              <Table>
                <THead>
                  <TR hover={false}>
                    <TH>Code</TH>
                    <TH>Label</TH>
                    <TH num>Sort</TH>
                    <TH>Status</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {activeValues.map((v) => (
                    <TR key={v.id}>
                      <TD mono>{v.code}</TD>
                      <TD>
                        <form action={updateValueAction} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="tableKey" value={v.tableKey} />
                          <input
                            type="text"
                            name="label"
                            defaultValue={v.label}
                            className="px-2 py-1 text-[13px] rounded"
                            style={{
                              background: "var(--paper)",
                              border: "1px solid var(--line-2)",
                              color: "var(--ink)",
                            }}
                          />
                          <input
                            type="number"
                            name="sortOrder"
                            defaultValue={v.sortOrder}
                            className="px-2 py-1 text-[13px] rounded w-16"
                            style={{
                              background: "var(--paper)",
                              border: "1px solid var(--line-2)",
                              color: "var(--ink)",
                              fontFamily: "var(--font-mono)",
                            }}
                          />
                          <label className="flex items-center gap-1 text-[12.5px]">
                            <input
                              type="checkbox"
                              name="isActive"
                              defaultChecked={v.isActive}
                            />
                            <span style={{ color: "var(--ink-3)" }}>Active</span>
                          </label>
                          <Button variant="ghost" type="submit">
                            Save
                          </Button>
                        </form>
                      </TD>
                      <TD num>{v.sortOrder}</TD>
                      <TD>
                        <Pill variant={statusVariant(v.isActive ? "active" : "inactive")}>
                          {statusLabel(v.isActive ? "active" : "inactive")}
                        </Pill>
                      </TD>
                      <TD>
                        {!v.isSystem && (
                          <form action={deleteValueAction}>
                            <input type="hidden" name="id" value={v.id} />
                            <input type="hidden" name="tableKey" value={v.tableKey} />
                            <Button variant="ghost" type="submit">
                              Remove
                            </Button>
                          </form>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}

            <form action={addValueAction} className="mt-3.5">
              <input type="hidden" name="tableKey" value={activeTable.key} />
              <div className="flex flex-col gap-3">
                <Row>
                  <Field label="Code" name="code" required mono placeholder="some_code" />
                  <Field label="Label" name="label" required placeholder="Some Code" />
                </Row>
                <Row>
                  <Field label="Sort order" name="sortOrder" mono type="number" defaultValue="0" />
                  <div />
                </Row>
                <div className="flex justify-end">
                  <Button variant="primary" type="submit">
                    Add value
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
