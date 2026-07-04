import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { getSessionUser } from "@/lib/session";
import {
  getAccounts,
  getAmortizationGeneratedTotals,
  getAmortizationSchedules,
  getFirmEntities,
} from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/lib/permissions";

import { createScheduleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const errorMsg = params.error ?? null;
  const canWrite = hasPermission(user, "settings.write");

  const [schedules, accounts, offices, generated] = await Promise.all([
    getAmortizationSchedules(),
    getAccounts("all"),
    getFirmEntities(),
    getAmortizationGeneratedTotals(),
  ]);
  const acctById = new Map(accounts.map((a) => [a.id, a]));

  const fmt = (n: number) =>
    formatMoney(n, "USD", { paren: true, hideCurrency: true });

  return (
    <>
      <PageHeader title="Amortization &amp; Depreciation" meta={`${schedules.length} schedules`} />

      <div className="px-6 py-3.5 flex flex-col gap-3.5">
        {errorMsg && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {errorMsg}
          </div>
        )}

        <Card title="Schedules">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Name</TH>
                <TH>Kind</TH>
                <TH>Source → Target</TH>
                <TH num>Cost</TH>
                <TH num>Remaining</TH>
                <TH>Through</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {schedules.length === 0 && (
                <TR>
                  <TD colSpan={7} style={{ color: "var(--ink-3)" }}>
                    No schedules yet.
                  </TD>
                </TR>
              )}
              {schedules.map((s) => {
                const src = acctById.get(s.sourceAccountId);
                const tgt = acctById.get(s.targetAccountId);
                const gen = generated.get(s.id) ?? 0;
                const remaining = s.totalCost - s.residualValue - gen;
                return (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/schedules/${s.id}`} style={{ color: "var(--ink)" }}>
                        {s.name}
                      </Link>
                    </TD>
                    <TD>
                      <Pill variant={s.kind === "prepaid" ? "neutral" : "formation"}>
                        {s.kind === "prepaid" ? "Prepaid" : "Fixed asset"}
                      </Pill>
                    </TD>
                    <TD mono style={{ fontSize: 11.5 }}>
                      {src?.code ?? "?"} → {tgt?.code ?? "?"}
                    </TD>
                    <TD num>{fmt(s.totalCost)}</TD>
                    <TD num neg={remaining < 0}>{fmt(remaining)}</TD>
                    <TD>{s.generatedThrough ?? "—"}</TD>
                    <TD>
                      <Link
                        href={`/schedules/${s.id}`}
                        className="text-[12px]"
                        style={{ color: "var(--ink-3)" }}
                      >
                        Detail
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>

        {canWrite && (
          <Card title="New schedule">
            <form
              action={createScheduleAction}
              className="flex flex-col gap-3 px-3 py-3"
              style={{ maxWidth: 640 }}
            >
              <Row>
                <SelectField label="Kind" name="kind" required defaultValue="prepaid">
                  <option value="prepaid">Prepaid amortization</option>
                  <option value="fixed_asset">Fixed-asset depreciation</option>
                </SelectField>
                <Field label="Name" name="name" required placeholder="Prepaid insurance 2026" />
              </Row>
              <Row>
                <SelectField
                  label="Source account (prepaid asset / accumulated depreciation)"
                  name="sourceAccountId"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select account…
                  </option>
                  {accounts
                    .filter((a) => a.accountType === "asset")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                </SelectField>
                <SelectField
                  label="Target account (expense)"
                  name="targetAccountId"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select account…
                  </option>
                  {accounts
                    .filter((a) => a.accountType === "expense")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                </SelectField>
              </Row>
              <Row>
                <SelectField label="Firm entity (optional)" name="firmEntityId" defaultValue="">
                  <option value="">Firm-level</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label="Start date"
                  name="startDate"
                  type="date"
                  required
                />
              </Row>
              <Row>
                <Field
                  label="Total cost"
                  name="totalCost"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  mono
                />
                <Field
                  label="Residual value"
                  name="residualValue"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue="0"
                  mono
                  help="0 for prepaids; salvage value for fixed assets."
                />
              </Row>
              <Row>
                <Field
                  label="Months (straight-line)"
                  name="months"
                  type="number"
                  min="1"
                  step="1"
                  required
                  mono
                />
                <div />
              </Row>
              <TextareaField label="Notes" name="notes" placeholder="Optional" />
              <div>
                <Button variant="primary" type="submit">
                  Create schedule
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
