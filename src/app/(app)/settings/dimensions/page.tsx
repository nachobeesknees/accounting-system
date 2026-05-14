import Link from "next/link";
import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row } from "@/components/ui/Field";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getDimensions, getDimensionsWithValues } from "@/lib/data";
import { getSessionUser } from "@/lib/session";
import {
  createDimensionAction,
  createDimensionValueAction,
  deleteDimensionAction,
  deleteDimensionValueAction,
  updateDimensionAction,
  updateDimensionValueAction,
} from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    edit?: string;
    editValue?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { saved, error, edit, editValue } = await searchParams;

  // Pull every dimension (incl. inactive) for management; pair with values.
  const [allDims, withValues] = await Promise.all([
    getDimensions(),
    getDimensionsWithValues(),
  ]);
  const valuesByDim = new Map(
    withValues.map((d) => [d.dimension.id, d.values] as const),
  );

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Settings", href: "/settings" }, { label: "Dimensions" }]}
      />
      <PageHeader
        title="Dimensions"
        meta={`${allDims.length} dimension${allDims.length === 1 ? "" : "s"}`}
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

        {/* ---- New dimension ---- */}
        <Card title="+ New dimension">
          <form action={createDimensionAction}>
            <div className="flex flex-col gap-3 px-3 py-2.5">
              <Row>
                <Field
                  label="Key"
                  name="key"
                  required
                  mono
                  placeholder="cost_center"
                  help="Lowercase, starts with a letter, only letters/digits/underscore."
                />
                <Field
                  label="Label"
                  name="label"
                  required
                  placeholder="Cost center"
                />
              </Row>
              <Field
                label="Description"
                name="description"
                placeholder="Optional"
              />
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Create dimension
                </Button>
              </div>
            </div>
          </form>
        </Card>

        {/* ---- Existing dimensions ---- */}
        {allDims.length === 0 ? (
          <Card title="Dimensions">
            <Empty
              title="No dimensions yet"
              body="Add a dimension above to start tagging journal/invoice/bill lines."
            />
          </Card>
        ) : (
          allDims.map((dim) => {
            const editing = edit === dim.id;
            const values = valuesByDim.get(dim.id) ?? [];
            return (
              <Card
                key={dim.id}
                title={
                  <span className="flex items-center gap-2">
                    <span>{dim.label}</span>
                    <span
                      className="text-[11.5px]"
                      style={{
                        color: "var(--ink-3)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {dim.key}
                    </span>
                    {!dim.isActive && (
                      <Pill variant={statusVariant("inactive")}>
                        {statusLabel("inactive")}
                      </Pill>
                    )}
                  </span>
                }
                actions={
                  editing ? (
                    <Link
                      href="/settings/dimensions"
                      className="text-[12.5px]"
                      style={{ color: "var(--ink-3)" }}
                    >
                      Cancel
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/settings/dimensions?edit=${dim.id}`}
                        className="text-[12.5px]"
                        style={{ color: "var(--ink-3)" }}
                      >
                        Edit dimension
                      </Link>
                      {dim.isActive && (
                        <form action={deleteDimensionAction}>
                          <input type="hidden" name="id" value={dim.id} />
                          <Button variant="ghost" type="submit">
                            Deactivate
                          </Button>
                        </form>
                      )}
                    </div>
                  )
                }
              >
                {editing && (
                  <form action={updateDimensionAction}>
                    <div
                      className="flex flex-col gap-3 px-3 py-2.5"
                      style={{ borderBottom: "1px solid var(--line)" }}
                    >
                      <input type="hidden" name="id" value={dim.id} />
                      <Row>
                        <Field
                          label="Label"
                          name="label"
                          required
                          defaultValue={dim.label}
                          autoFocus
                        />
                        <Field
                          label="Description"
                          name="description"
                          defaultValue={dim.description ?? ""}
                        />
                      </Row>
                      <label className="flex items-center gap-1.5 text-[12.5px]">
                        <input
                          type="checkbox"
                          name="isActive"
                          defaultChecked={dim.isActive}
                        />
                        <span style={{ color: "var(--ink-3)" }}>Active</span>
                      </label>
                      <div className="flex justify-end gap-2">
                        <Button variant="primary" type="submit">
                          Save dimension
                        </Button>
                      </div>
                    </div>
                  </form>
                )}

                {values.length === 0 ? (
                  <Empty
                    title="No values"
                    body="Add a value below to make this dimension selectable."
                  />
                ) : (
                  <Table>
                    <THead>
                      <TR hover={false}>
                        <TH>Code</TH>
                        <TH>Label</TH>
                        <TH>Status</TH>
                        <TH>{""}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {values.map((v) => {
                        const vEditing = editValue === v.id;
                        return (
                          <TR key={v.id}>
                            {vEditing ? (
                              <TD colSpan={4}>
                                <form
                                  action={updateDimensionValueAction}
                                  className="flex items-end gap-2 flex-wrap"
                                >
                                  <input type="hidden" name="id" value={v.id} />
                                  <Field
                                    label="Code"
                                    name="code"
                                    mono
                                    required
                                    defaultValue={v.code}
                                    autoFocus
                                  />
                                  <Field
                                    label="Label"
                                    name="label"
                                    required
                                    defaultValue={v.label}
                                  />
                                  <label className="flex items-center gap-1.5 text-[12.5px] pb-2">
                                    <input
                                      type="checkbox"
                                      name="isActive"
                                      defaultChecked={v.isActive}
                                    />
                                    <span style={{ color: "var(--ink-3)" }}>
                                      Active
                                    </span>
                                  </label>
                                  <Button variant="primary" type="submit">
                                    Save
                                  </Button>
                                  <Link
                                    href={`/settings/dimensions${
                                      edit ? `?edit=${edit}` : ""
                                    }`}
                                    className="px-3 py-1.5 text-[12.5px] rounded-md"
                                    style={{ color: "var(--ink-3)" }}
                                  >
                                    Cancel
                                  </Link>
                                </form>
                              </TD>
                            ) : (
                              <>
                                <TD mono>{v.code}</TD>
                                <TD>{v.label}</TD>
                                <TD>
                                  <Pill
                                    variant={statusVariant(
                                      v.isActive ? "active" : "inactive",
                                    )}
                                  >
                                    {statusLabel(
                                      v.isActive ? "active" : "inactive",
                                    )}
                                  </Pill>
                                </TD>
                                <TD>
                                  <div className="flex gap-2">
                                    <Link
                                      href={`/settings/dimensions?editValue=${v.id}${
                                        edit ? `&edit=${edit}` : ""
                                      }`}
                                      className="text-[12.5px]"
                                      style={{ color: "var(--ink-3)" }}
                                    >
                                      Edit
                                    </Link>
                                    {v.isActive && (
                                      <form
                                        action={deleteDimensionValueAction}
                                      >
                                        <input
                                          type="hidden"
                                          name="id"
                                          value={v.id}
                                        />
                                        <Button variant="ghost" type="submit">
                                          Deactivate
                                        </Button>
                                      </form>
                                    )}
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

                <form action={createDimensionValueAction}>
                  <div
                    className="flex items-end gap-2 px-3 py-2.5 flex-wrap"
                    style={{ borderTop: "1px solid var(--line)" }}
                  >
                    <input type="hidden" name="dimensionId" value={dim.id} />
                    <Field
                      label="+ New value · Code"
                      name="code"
                      mono
                      required
                      placeholder="e.g. tax"
                    />
                    <Field
                      label="Label"
                      name="label"
                      required
                      placeholder="e.g. Tax"
                    />
                    <Button variant="primary" type="submit">
                      Add
                    </Button>
                  </div>
                </form>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
