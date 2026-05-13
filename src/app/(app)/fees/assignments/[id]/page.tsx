import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Empty } from "@/components/ui/Empty";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { KV, KVGrid } from "@/components/ui/KV";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import {
  getCustomers,
  getEntities,
  getEntityFeeById,
  getFeeSchedules,
  getTimeEntries,
  getUsers,
} from "@/lib/data";
import { formatUSD, parseAmount } from "@/lib/money";
import type { FeeFrequency } from "@/lib/types";
import {
  deleteAssignmentAction,
  updateAssignmentAction,
} from "./actions";
import { Attachments } from "@/components/Attachments";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function frequencyLabel(f: FeeFrequency | undefined | null): string {
  switch (f) {
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "semiannual":
      return "Semi-annual";
    case "annual":
      return "Annual";
    case "one_time":
      return "One time";
    default:
      return "Annual";
  }
}

function periodCount(f: FeeFrequency | undefined | null): number {
  switch (f) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "one_time":
      return 1;
    case "annual":
    default:
      return 1;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const fee = await getEntityFeeById(id);
  if (!fee) notFound();

  const [entities, customers, schedules, timeEntries, users] = await Promise.all([
    getEntities(),
    getCustomers(),
    getFeeSchedules(),
    getTimeEntries(),
    getUsers(),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c] as const));
  const entity = entities.find((e) => e.id === fee.entityId);
  const client = entity ? customerById.get(entity.clientId) : undefined;
  const matchingSchedules = entity
    ? schedules.filter((s) => s.entityKind === entity.kind)
    : schedules;

  const userById = new Map(users.map((u) => [u.id, u] as const));
  const linkedTime = timeEntries.filter((t) => t.entityFeeId === fee.id);
  const totalHoursLogged = linkedTime.reduce(
    (s, t) => s + parseAmount(t.durationHours),
    0,
  );
  const includedHoursNum = parseAmount(fee.includedHours);

  const freq = (fee.frequency ?? "annual") as FeeFrequency;
  const periods = periodCount(freq);
  const annualFeeNum = parseAmount(fee.annualFee);
  const derivedPerPeriod = periods > 0 ? annualFeeNum / periods : annualFeeNum;
  const perPeriod =
    fee.perPeriodAmount != null && fee.perPeriodAmount !== ""
      ? parseAmount(fee.perPeriodAmount)
      : derivedPerPeriod;

  const monthName =
    fee.billingMonth != null && fee.billingMonth >= 1 && fee.billingMonth <= 12
      ? MONTH_NAMES[fee.billingMonth - 1]
      : null;
  const billingDay = fee.billingDay ?? null;
  const billingMonthDay =
    monthName && billingDay
      ? `Every ${monthName} ${billingDay}`
      : monthName
        ? `Every ${monthName}`
        : billingDay
          ? `Every ${ordinal(billingDay)} of period`
          : "—";

  const servicePeriod = fee.startDate
    ? `${fee.startDate} – ${fee.endDate ?? "ongoing"}`
    : fee.endDate
      ? `— – ${fee.endDate}`
      : "ongoing";

  return (
    <>
      <PageHeader
        title={`${entity?.code ?? "Entity fee"} · ${fee.billingYear}`}
        meta={entity ? `${entity.name}${client ? ` · ${client.name}` : ""}` : undefined}
        actions={
          <>
            <ButtonLink href="/fees" variant="secondary">
              ← All fees
            </ButtonLink>
            <ButtonLink
              href={`/fees/assignments/${fee.id}/edit`}
              variant="secondary"
            >
              Edit billing schedule
            </ButtonLink>
            <Pill variant={statusVariant(fee.status)}>
              {statusLabel(fee.status)}
            </Pill>
          </>
        }
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

        <form action={updateAssignmentAction}>
          <input type="hidden" name="id" value={fee.id} />
          <Card title="Assignment details">
            <div className="flex flex-col gap-3">
              <Row>
                <SelectField label="Entity" name="entityId" required defaultValue={fee.entityId}>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.code} — {e.name}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label="Billing year"
                  name="billingYear"
                  required
                  type="number"
                  mono
                  defaultValue={String(fee.billingYear)}
                />
              </Row>
              <Row>
                <SelectField
                  label="Schedule"
                  name="feeScheduleId"
                  defaultValue={fee.feeScheduleId ?? ""}
                >
                  <option value="">Custom (no template)</option>
                  {matchingSchedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Status" name="status" defaultValue={fee.status}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="billed">Billed</option>
                  <option value="paid">Paid</option>
                  <option value="void">Void</option>
                </SelectField>
              </Row>
              <Row>
                <MoneyInput
                  label="Annual fee"
                  name="annualFee"
                  required
                  defaultValue={fee.annualFee}
                />
                <Field
                  label="Included hours"
                  name="includedHours"
                  required
                  mono
                  inputMode="decimal"
                  defaultValue={fee.includedHours}
                />
              </Row>
              <TextareaField label="Notes" name="notes" defaultValue={fee.notes ?? ""} />
            </div>
            <div className="flex justify-end gap-2 mt-3.5">
              <Button variant="primary" type="submit">
                Save changes
              </Button>
            </div>
          </Card>
        </form>

        <Card
          title="Billing schedule"
          actions={
            <ButtonLink
              href={`/fees/assignments/${fee.id}/edit`}
              variant="secondary"
            >
              Edit
            </ButtonLink>
          }
        >
          <KVGrid>
            <KV
              k="Frequency"
              v={
                <Pill variant="neutral">{frequencyLabel(freq)}</Pill>
              }
            />
            <KV k="Service period" v={servicePeriod} mono />
            <KV k="Billing month/day" v={billingMonthDay} />
            <KV
              k="Next billing date"
              v={fee.nextBillingDate ?? "—"}
              mono
            />
            <KV
              k="Per-period amount"
              v={formatUSD(perPeriod)}
              sub={
                fee.perPeriodAmount != null && fee.perPeriodAmount !== ""
                  ? "Override"
                  : `Derived: ${formatUSD(annualFeeNum)} ÷ ${periods}`
              }
              mono
            />
            <KV
              k="Last billed"
              v={fee.lastBilledDate ?? "—"}
              mono
            />
          </KVGrid>
        </Card>

        <Card title="Time logged against this service">
          {linkedTime.length === 0 ? (
            <Empty
              title="No time logged yet"
              body="Time entries can be linked to this service when logging."
            />
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Date</TH>
                  <TH>User</TH>
                  <TH>Description</TH>
                  <TH num>Hours</TH>
                </TR>
              </THead>
              <TBody>
                {linkedTime.map((t) => {
                  const u = userById.get(t.userId);
                  return (
                    <TR key={t.id} href={`/time/${t.id}`}>
                      <TD mono>{t.entryDate}</TD>
                      <TD>{u?.fullName ?? t.userId}</TD>
                      <TD>{t.description}</TD>
                      <TD num>{parseAmount(t.durationHours).toFixed(2)}</TD>
                    </TR>
                  );
                })}
                <TR total hover={false}>
                  <TD />
                  <TD />
                  <TD>
                    Total
                    {includedHoursNum > 0
                      ? ` (of ${includedHoursNum.toFixed(2)} included)`
                      : ""}
                  </TD>
                  <TD num>{totalHoursLogged.toFixed(2)}</TD>
                </TR>
              </TBody>
            </Table>
          )}
        </Card>

        {entity && (
          <Link
            href={`/entities/${entity.id}`}
            style={{
              color: "var(--ink-3)",
              fontSize: 12,
              textDecoration: "underline",
            }}
          >
            View entity →
          </Link>
        )}

        <Attachments
          recordType="fee"
          recordId={fee.id}
          redirectPath={`/fees/assignments/${fee.id}`}
        />

        <form action={deleteAssignmentAction}>
          <input type="hidden" name="id" value={fee.id} />
          <Card title="Danger zone">
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span style={{ color: "var(--ink-3)" }}>
                Deleting this assignment removes the entity's fee record for{" "}
                {fee.billingYear}. The invoice (if any) is not deleted.
              </span>
              <ConfirmButton
                label="Delete assignment"
                title={`Delete ${fee.billingYear} fee assignment?`}
                message={`This removes the entity's fee record for ${fee.billingYear}. The invoice (if any) is not deleted. This cannot be undone.`}
                confirmText="Delete assignment"
              />
            </div>
          </Card>
        </form>
      </div>
    </>
  );
}
