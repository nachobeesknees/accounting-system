import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getCustomFieldDefinitions } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import {
  createDefinitionAction,
  deleteDefinitionAction,
  updateDefinitionAction,
} from "./actions";
import type { CustomFieldRecordType } from "@/lib/types";

const RECORD_LABEL: Record<CustomFieldRecordType, string> = {
  entity: "Entity",
  contact: "Contact",
  asset: "Asset",
  bank_account: "Bank account",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { saved, error } = await searchParams;

  if (!user.isSuperuser) {
    return (
      <>
        <PageHeader title="Custom fields" meta="Admin only" />
        <div className="px-6 my-3.5">
          <Card title="Restricted">
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              Custom-field definitions are admin-only.
            </p>
          </Card>
        </div>
      </>
    );
  }

  const defs = await getCustomFieldDefinitions();
  const grouped = new Map<CustomFieldRecordType, typeof defs>();
  for (const d of defs) {
    const arr = grouped.get(d.recordType) ?? [];
    arr.push(d);
    grouped.set(d.recordType, arr);
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Custom fields" },
        ]}
      />
      <PageHeader title="Custom fields" meta={`${defs.length} definitions`} />

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

        {(["entity", "contact", "asset", "bank_account"] as const).map((rt) => {
          const list = grouped.get(rt) ?? [];
          return (
            <Card key={rt} title={`${RECORD_LABEL[rt]} fields (${list.length})`}>
              {list.length === 0 ? (
                <Empty title="None" body="Define your first one below." />
              ) : (
                <Table>
                  <THead>
                    <TR hover={false}>
                      <TH>Key</TH>
                      <TH>Label</TH>
                      <TH>Type</TH>
                      <TH>Options</TH>
                      <TH num>Order</TH>
                      <TH>Required</TH>
                      <TH>Status</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {list.map((d) => (
                      <TR key={d.id}>
                        <TD mono>{d.fieldKey}</TD>
                        <TD>
                          <form action={updateDefinitionAction} className="flex items-center gap-2">
                            <input type="hidden" name="id" value={d.id} />
                            <input
                              type="text"
                              name="label"
                              defaultValue={d.label}
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
                              defaultValue={d.sortOrder}
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
                                name="isRequired"
                                defaultChecked={d.isRequired}
                              />
                              <span style={{ color: "var(--ink-3)" }}>Req</span>
                            </label>
                            <label className="flex items-center gap-1 text-[12.5px]">
                              <input
                                type="checkbox"
                                name="isActive"
                                defaultChecked={d.isActive}
                              />
                              <span style={{ color: "var(--ink-3)" }}>Act</span>
                            </label>
                            <input
                              type="text"
                              name="helpText"
                              defaultValue={d.helpText ?? ""}
                              placeholder="help"
                              className="px-2 py-1 text-[12px] rounded flex-1"
                              style={{
                                background: "var(--paper)",
                                border: "1px solid var(--line-2)",
                                color: "var(--ink-3)",
                              }}
                            />
                            <Button variant="ghost" type="submit">
                              Save
                            </Button>
                          </form>
                        </TD>
                        <TD style={{ color: "var(--ink-3)" }}>{d.fieldType}</TD>
                        <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                          {d.options ? d.options.join(", ") : "—"}
                        </TD>
                        <TD num>{d.sortOrder}</TD>
                        <TD>
                          {d.isRequired ? (
                            <Pill variant="active">Yes</Pill>
                          ) : (
                            <Pill variant="neutral">No</Pill>
                          )}
                        </TD>
                        <TD>
                          <Pill variant={statusVariant(d.isActive ? "active" : "inactive")}>
                            {statusLabel(d.isActive ? "active" : "inactive")}
                          </Pill>
                        </TD>
                        <TD>
                          <form action={deleteDefinitionAction}>
                            <input type="hidden" name="id" value={d.id} />
                            <Button variant="ghost" type="submit">
                              Remove
                            </Button>
                          </form>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>
          );
        })}

        <form action={createDefinitionAction}>
          <Card title="New custom field">
            <div className="flex flex-col gap-3">
              <Row>
                <SelectField label="Record type" name="recordType" required defaultValue="entity">
                  <option value="entity">Entity</option>
                  <option value="contact">Contact</option>
                  <option value="asset">Asset</option>
                  <option value="bank_account">Bank account</option>
                </SelectField>
                <SelectField label="Field type" name="fieldType" required defaultValue="text">
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="boolean">Boolean</option>
                  <option value="select">Select</option>
                </SelectField>
              </Row>
              <Row>
                <Field
                  label="Field key"
                  name="fieldKey"
                  required
                  mono
                  placeholder="internal_ref"
                />
                <Field
                  label="Label"
                  name="label"
                  required
                  placeholder="Internal reference"
                />
              </Row>
              <Row>
                <Field label="Sort order" name="sortOrder" mono type="number" defaultValue="0" />
                <label className="flex items-end gap-2 text-[13px]">
                  <input type="checkbox" name="isRequired" />
                  <span style={{ color: "var(--ink-2)" }}>Required</span>
                </label>
              </Row>
              <TextareaField
                label="Options (one per line, for select type)"
                name="options"
                placeholder="Low&#10;Medium&#10;High"
              />
              <Field label="Help text" name="helpText" />
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Create definition
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
