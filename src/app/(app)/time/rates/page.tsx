import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getEmployeeRates, getUsers } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { formatUSD } from "@/lib/money";
import { createRateAction, deleteRateAction } from "./actions";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const [rates, users] = await Promise.all([getEmployeeRates(), getUsers()]);
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Rates" meta={`${rates.length} rate entries`} />

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

        <Card title="Current rates">
          {rates.length === 0 ? (
            <Empty
              title="No rates set"
              body="Add a billable / cost rate per employee below."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>User</TH>
                  <TH>Role</TH>
                  <TH num>Billable rate</TH>
                  <TH num>Cost rate</TH>
                  <TH>Effective</TH>
                  <TH>Default</TH>
                  <TH>Notes</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {rates.map((r) => {
                  const u = userById.get(r.userId);
                  return (
                    <TR key={r.id}>
                      <TD>{u?.fullName ?? "—"}</TD>
                      <TD style={{ color: "var(--ink-3)" }}>{r.role}</TD>
                      <TD num>{formatUSD(r.billableRate, { paren: true })}</TD>
                      <TD num>
                        {r.costRate ? formatUSD(r.costRate, { paren: true }) : "—"}
                      </TD>
                      <TD>{formatDate(r.effectiveDate)}</TD>
                      <TD>
                        {r.isDefault ? (
                          <Pill variant="active">Default</Pill>
                        ) : (
                          <Pill variant="neutral">Override</Pill>
                        )}
                      </TD>
                      <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                        {r.notes ?? "—"}
                      </TD>
                      <TD>
                        <form action={deleteRateAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <Button variant="ghost" type="submit">
                            Remove
                          </Button>
                        </form>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <form action={createRateAction}>
          <Card title="Add rate">
            <div className="flex flex-col gap-3">
              <Row>
                <SelectField label="User" name="userId" required defaultValue="">
                  <option value="" disabled>
                    Select user…
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.role})
                    </option>
                  ))}
                </SelectField>
                <Field label="Role label" name="role" required placeholder="Bookkeeper, Controller, CFO…" />
              </Row>
              <Row>
                <Field
                  label="Billable rate"
                  name="billableRate"
                  required
                  mono
                  inputMode="decimal"
                  placeholder="0.00"
                />
                <Field
                  label="Cost rate (optional)"
                  name="costRate"
                  mono
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </Row>
              <Row>
                <Field
                  label="Effective date"
                  name="effectiveDate"
                  type="date"
                  required
                  defaultValue={today}
                />
                <label className="flex items-end gap-2 text-[13px]">
                  <input type="checkbox" name="isDefault" defaultChecked />
                  <span style={{ color: "var(--ink-2)" }}>Default for this user</span>
                </label>
              </Row>
              <TextareaField label="Notes" name="notes" />
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  Add rate
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
