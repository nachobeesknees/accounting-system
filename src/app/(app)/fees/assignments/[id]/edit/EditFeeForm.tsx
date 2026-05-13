"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Field,
  Row,
  SelectField,
  TextareaField,
} from "@/components/ui/Field";
import type { Entity, EntityFee, FeeFrequency } from "@/lib/types";
import { saveFeeAction } from "./actions";

function periodCount(f: FeeFrequency): number {
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

function deriveNextBillingDate(
  freq: FeeFrequency,
  billingMonth: number | null,
  billingDay: number | null,
  startDate: string | null,
): string {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = billingMonth && billingMonth >= 1 && billingMonth <= 12
    ? billingMonth - 1
    : startDate
      ? new Date(`${startDate}T00:00:00Z`).getUTCMonth()
      : today.getUTCMonth();
  const day = billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : 1;

  // Pick the next occurrence of (month, day) >= today.
  let candidate = new Date(Date.UTC(year, month, day));
  if (candidate.getTime() < today.getTime()) {
    if (freq === "annual" || freq === "one_time") {
      candidate = new Date(Date.UTC(year + 1, month, day));
    } else if (freq === "semiannual") {
      candidate = new Date(Date.UTC(year, month + 6, day));
    } else if (freq === "quarterly") {
      candidate = new Date(Date.UTC(year, month + 3, day));
    } else if (freq === "monthly") {
      candidate = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, day),
      );
    }
  }
  return candidate.toISOString().slice(0, 10);
}

export function EditFeeForm({
  fee,
  entity,
  error,
}: {
  fee: EntityFee;
  entity: Entity | null;
  error: string | null;
}) {
  const initialFreq: FeeFrequency = (fee.frequency ?? "annual") as FeeFrequency;
  const [frequency, setFrequency] = useState<FeeFrequency>(initialFreq);
  const [annualFee, setAnnualFee] = useState<string>(fee.annualFee);
  const [perPeriod, setPerPeriod] = useState<string>(fee.perPeriodAmount ?? "");
  const [billingMonth, setBillingMonth] = useState<string>(
    fee.billingMonth != null ? String(fee.billingMonth) : "",
  );
  const [billingDay, setBillingDay] = useState<string>(
    fee.billingDay != null ? String(fee.billingDay) : "1",
  );
  const [startDate, setStartDate] = useState<string>(
    fee.startDate ?? entity?.formationDate ?? "",
  );
  const [nextBillingTouched, setNextBillingTouched] = useState(false);
  const [nextBillingDate, setNextBillingDate] = useState<string>(
    fee.nextBillingDate ?? "",
  );

  const periods = periodCount(frequency);
  const annualNum = Number.parseFloat(annualFee);
  const derivedPerPeriod = useMemo(() => {
    if (!Number.isFinite(annualNum) || annualNum <= 0 || periods <= 0)
      return "";
    return (annualNum / periods).toFixed(2);
  }, [annualNum, periods]);

  // Auto-update next billing when month/day/start/frequency change, only if
  // the user hasn't manually edited the next billing date.
  const autoNext = useMemo(() => {
    return deriveNextBillingDate(
      frequency,
      billingMonth ? Number.parseInt(billingMonth, 10) : null,
      billingDay ? Number.parseInt(billingDay, 10) : null,
      startDate || null,
    );
  }, [frequency, billingMonth, billingDay, startDate]);

  const nextBillingValue = nextBillingTouched
    ? nextBillingDate
    : (nextBillingDate || autoNext);

  return (
    <form action={saveFeeAction}>
      <input type="hidden" name="id" value={fee.id} />
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

        <Card title="Billing schedule">
          <div className="flex flex-col gap-3">
            <Row>
              <SelectField
                label="Frequency"
                name="frequency"
                required
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as FeeFrequency)}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semiannual">Semi-annual</option>
                <option value="annual">Annual</option>
                <option value="one_time">One time</option>
              </SelectField>
              <SelectField
                label="Status"
                name="status"
                defaultValue={fee.status}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="billed">Billed</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </SelectField>
            </Row>
            <Row>
              <Field
                label="Annual fee (USD)"
                name="annualFee"
                required
                mono
                inputMode="decimal"
                value={annualFee}
                onChange={(e) => setAnnualFee(e.target.value)}
              />
              <Field
                label="Per-period amount (override)"
                name="perPeriodAmount"
                mono
                inputMode="decimal"
                placeholder={
                  derivedPerPeriod
                    ? `Auto: ${derivedPerPeriod} (annual ÷ ${periods})`
                    : "Auto from annual ÷ periods"
                }
                value={perPeriod}
                onChange={(e) => setPerPeriod(e.target.value)}
              />
            </Row>
            <Row>
              <Field
                label="Included hours"
                name="includedHours"
                required
                mono
                inputMode="decimal"
                defaultValue={fee.includedHours}
              />
              <Field
                label="Start date"
                name="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Row>
            <Row>
              <Field
                label="End date (optional)"
                name="endDate"
                type="date"
                defaultValue={fee.endDate ?? ""}
              />
              <Field
                label="Bill in month (e.g. 3 = March)"
                name="billingMonth"
                type="number"
                min={1}
                max={12}
                mono
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
              />
            </Row>
            <Row>
              <Field
                label="Billing day (1–31)"
                name="billingDay"
                type="number"
                min={1}
                max={31}
                mono
                value={billingDay}
                onChange={(e) => setBillingDay(e.target.value)}
              />
              <Field
                label="Next billing date"
                name="nextBillingDate"
                type="date"
                value={nextBillingValue}
                onChange={(e) => {
                  setNextBillingTouched(true);
                  setNextBillingDate(e.target.value);
                }}
              />
            </Row>
            <TextareaField
              label="Notes"
              name="notes"
              defaultValue={fee.notes ?? ""}
            />
          </div>
          <div className="flex justify-end gap-2 mt-3.5">
            <Link
              href={`/fees/assignments/${fee.id}`}
              className="px-3 py-1.5 text-[13px] rounded-md"
              style={{
                border: "1px solid var(--line-2)",
                color: "var(--ink-2)",
                textDecoration: "none",
              }}
            >
              Cancel
            </Link>
            <Button variant="primary" type="submit">
              Save schedule
            </Button>
          </div>
        </Card>
      </div>
    </form>
  );
}
