"use client";

/**
 * Reactive banner for the new-JE / new-invoice / new-bill forms. Watches the
 * provided ISO date string and renders:
 *   - nothing if the date is in an open period (or no period exists)
 *   - a yellow warning + required override-reason textarea if "closed"
 *   - a red block message if "locked"
 *
 * The override textarea uses `name="periodOverrideReason"` so the parent
 * form submits it without further wiring; server actions read it back and
 * forward to `createJournalEntry` / `createInvoice` / `createBill`.
 *
 * The full list of periods is passed in once at render time (cheap — a few
 * dozen rows). Lookup is done client-side so the banner reacts immediately
 * to date changes without a round trip.
 */

import { useMemo } from "react";

import type { AccountingPeriod } from "@/lib/types";

function findPeriod(
  date: string,
  periods: AccountingPeriod[],
): AccountingPeriod | null {
  if (!date) return null;
  for (const p of periods) {
    if (date >= p.startDate && date <= p.endDate) return p;
  }
  return null;
}

export function PeriodStatusBanner({
  date,
  periods,
}: {
  date: string;
  periods: AccountingPeriod[];
}) {
  const period = useMemo(() => findPeriod(date, periods), [date, periods]);
  if (!period || period.status === "open") return null;

  if (period.status === "locked") {
    return (
      <div
        className="rounded-md px-3 py-2 text-[12.5px]"
        style={{
          background: "var(--p-review-bg)",
          color: "var(--p-review-fg)",
          border: "1px solid var(--p-review-fg)",
        }}
      >
        <strong>Period {period.name} is locked.</strong> Contact your
        administrator to reopen it before posting to this date.
      </div>
    );
  }

  // closed
  return (
    <div
      className="rounded-md px-3 py-2 flex flex-col gap-2"
      style={{
        background: "var(--p-pending-bg)",
        color: "var(--p-pending-fg)",
        border: "1px solid var(--p-pending-fg)",
      }}
    >
      <div className="text-[12.5px]">
        <strong>Period {period.name} is closed.</strong> Post anyway? Provide
        a reason — it will be recorded on the entry for audit.
      </div>
      <textarea
        name="periodOverrideReason"
        required
        rows={2}
        placeholder="Reason for posting into a closed period (required)"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--line-2)",
          borderRadius: 6,
          padding: "5px 8px",
          fontSize: 12.5,
          color: "var(--ink)",
        }}
      />
    </div>
  );
}
