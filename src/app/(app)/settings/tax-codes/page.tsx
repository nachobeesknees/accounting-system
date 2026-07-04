import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getTaxCodes } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";
import { seedDefaultTaxCodesIfEmpty } from "@/lib/mutations";
import { TAX_CODE_KINDS, taxKindLabel } from "@/lib/tax";
import { createTaxCodeAction, updateTaxCodeAction } from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { saved, error } = await searchParams;
  const canManage = hasPermission(user, "tax.manage_codes");

  if (!canManage) {
    return (
      <>
        <PageHeader title="Tax codes" meta="Admin only" />
        <div className="px-6 my-3.5">
          <Card title="Restricted">
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
              VAT/GST tax-code administration is restricted. Ask an admin to make
              changes.
            </p>
          </Card>
        </div>
      </>
    );
  }

  // Seed a few sensible defaults on first view when the table is empty.
  await seedDefaultTaxCodesIfEmpty(user);
  const codes = await getTaxCodes();

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Settings", href: "/settings" }, { label: "Tax codes" }]}
      />
      <PageHeader
        title="VAT / GST tax codes"
        meta={`${codes.length} codes · per-line rates + exemptions`}
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

        <Card title="Tax codes">
          {codes.length === 0 ? (
            <Empty title="No tax codes" body="Create one below." />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH num>Rate %</TH>
                  <TH>Kind</TH>
                  <TH>Country</TH>
                  <TH>Status</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {codes.map((c) => {
                  const ratePct = (parseFloat(c.rate) * 100)
                    .toFixed(3)
                    .replace(/\.?0+$/, "");
                  return (
                    <TR key={c.id} hover={false}>
                      <TD mono>{c.code}</TD>
                      <TD>
                        <form
                          action={updateTaxCodeAction}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="id" value={c.id} />
                          <input
                            type="text"
                            name="name"
                            defaultValue={c.name}
                            className="px-2 py-1 text-[13px] rounded"
                            style={{
                              background: "var(--paper)",
                              border: "1px solid var(--line-2)",
                              color: "var(--ink)",
                              minWidth: 140,
                            }}
                          />
                          <span className="flex items-center gap-1">
                            <input
                              type="number"
                              name="ratePct"
                              step="0.001"
                              min="0"
                              defaultValue={ratePct || "0"}
                              className="px-2 py-1 text-[13px] rounded w-20"
                              style={{
                                background: "var(--paper)",
                                border: "1px solid var(--line-2)",
                                color: "var(--ink)",
                                fontFamily: "var(--font-mono)",
                              }}
                            />
                            <span style={{ color: "var(--ink-3)" }}>%</span>
                          </span>
                          <select
                            name="kind"
                            defaultValue={c.kind}
                            className="px-2 py-1 text-[13px] rounded"
                            style={{
                              background: "var(--paper)",
                              border: "1px solid var(--line-2)",
                              color: "var(--ink)",
                            }}
                          >
                            {TAX_CODE_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {taxKindLabel(k)}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-[12.5px]">
                            <input
                              type="checkbox"
                              name="isActive"
                              defaultChecked={c.isActive}
                            />
                            <span style={{ color: "var(--ink-3)" }}>Active</span>
                          </label>
                          <Button variant="ghost" type="submit">
                            Save
                          </Button>
                        </form>
                      </TD>
                      <TD num>{ratePct || "0"}</TD>
                      <TD>
                        <Pill variant="neutral">{taxKindLabel(c.kind)}</Pill>
                      </TD>
                      <TD mono>{c.country ?? "—"}</TD>
                      <TD>
                        <Pill variant={c.isActive ? "active" : "neutral"}>
                          {c.isActive ? "Active" : "Inactive"}
                        </Pill>
                      </TD>
                      <TD></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={createTaxCodeAction}>
          <Card title="New tax code">
            <div className="flex flex-col gap-3">
              <Row>
                <Field label="Code" name="code" required mono placeholder="NZ-GST-15" />
                <Field label="Name" name="name" required placeholder="NZ GST 15%" />
              </Row>
              <Row>
                <Field
                  label="Rate %"
                  name="ratePct"
                  mono
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue="0"
                  help="0 for zero-rated / exempt / out-of-scope"
                />
                <SelectField label="Kind" name="kind" defaultValue="standard">
                  {TAX_CODE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {taxKindLabel(k)}
                    </option>
                  ))}
                </SelectField>
                <Field label="Country" name="country" mono placeholder="NZ" />
              </Row>
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Create tax code
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
