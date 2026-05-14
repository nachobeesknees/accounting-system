"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Pill, statusLabel, statusVariant } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export type SelectableBillRow = {
  id: string;
  billNumber: string;
  vendorName: string;
  vendorId: string;
  clientName: string;
  entityName: string;
  bankAccountName: string;
  billDate: string;
  dueDate: string;
  daysOverdue: number;
  bucket: "current" | "d30" | "d60" | "d90" | "d90p";
  balanceDue: number;
  status: string;
};

const BUCKET_LABEL: Record<SelectableBillRow["bucket"], string> = {
  current: "Current",
  d30: "1–30",
  d60: "31–60",
  d90: "61–90",
  d90p: "90+",
};

type ImpactStatus = "green" | "yellow" | "red";

function statusFor(cashAfter: number, cashBefore: number): ImpactStatus {
  if (cashAfter <= 0) return "red";
  if (cashBefore <= 0) return "red";
  const ratio = cashAfter / cashBefore;
  if (ratio < 0.25) return "red";
  if (ratio < 0.6) return "yellow";
  return "green";
}

const STATUS_COLOR: Record<ImpactStatus, string> = {
  green: "var(--p-active-fg)",
  yellow: "var(--p-pending-fg)",
  red: "var(--p-review-fg)",
};
const STATUS_BG: Record<ImpactStatus, string> = {
  green: "var(--p-active-bg)",
  yellow: "var(--p-pending-bg)",
  red: "var(--p-review-bg)",
};
const STATUS_LABEL: Record<ImpactStatus, string> = {
  green: "Comfortable",
  yellow: "Tight",
  red: "Underfunded",
};

export function SelectableBillsTable({
  rows,
  cashOnHand,
}: {
  rows: SelectableBillRow[];
  cashOnHand: number;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleSelectMode() {
    setSelectMode((m) => {
      if (m) setSelected(new Set());
      return !m;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedTotal = useMemo(
    () =>
      rows
        .filter((r) => selected.has(r.id))
        .reduce((s, r) => s + r.balanceDue, 0),
    [rows, selected],
  );

  const cashAfter = cashOnHand - selectedTotal;
  const impact = statusFor(cashAfter, cashOnHand);

  const csvHref = useMemo(() => {
    const ids = Array.from(selected);
    const qs = ids.length > 0 ? `?ids=${ids.join(",")}` : "";
    return `/api/reports/ap-aging/csv${qs}`;
  }, [selected]);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center justify-between px-3.5 py-2"
        style={{
          borderBottom: "1px solid var(--line)",
          background: "var(--rail)",
        }}
      >
        <div className="text-[12px]" style={{ color: "var(--ink-2)" }}>
          {selectMode
            ? selected.size === 0
              ? `${rows.length} open bills — pick to plan a payment run`
              : `${selected.size} selected · ${formatMoney(selectedTotal, "USD", { compact: true, paren: true })}`
            : `${rows.length} open bills`}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={selectMode ? "primary" : "secondary"}
            onClick={toggleSelectMode}
          >
            {selectMode ? "Exit selection" : "Select payments"}
          </Button>
          {selectMode && (
            <>
              <a
                href={csvHref}
                aria-disabled={selected.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium no-underline"
                style={{
                  background: "var(--raised)",
                  color:
                    selected.size === 0 ? "var(--ink-4)" : "var(--ink)",
                  border: "1px solid var(--line-2)",
                  pointerEvents: selected.size === 0 ? "none" : undefined,
                  opacity: selected.size === 0 ? 0.6 : 1,
                }}
              >
                Export CSV{selected.size > 0 ? ` (${selected.size})` : ""}
              </a>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
              >
                Clear selection
              </Button>
            </>
          )}
        </div>
      </div>
      <Table>
        <THead>
          <TR hover={false}>
            {selectMode && (
              <TH style={{ width: 28 }}>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                />
              </TH>
            )}
            <TH>Bill #</TH>
            <TH>Vendor</TH>
            <TH>Client</TH>
            <TH>Entity</TH>
            <TH>Bank account</TH>
            <TH>Bill date</TH>
            <TH>Due</TH>
            <TH num>Days overdue</TH>
            <TH>Bucket</TH>
            <TH num>Balance (USD)</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TR hover={false}>
              <TD colSpan={selectMode ? 12 : 11} style={{ color: "var(--ink-3)" }}>
                No open bills.
              </TD>
            </TR>
          )}
          {rows.map((r) => {
            const isOverdue = r.daysOverdue > 0;
            const isChecked = selected.has(r.id);
            return (
              <TR key={r.id} hover={false}>
                {selectMode && (
                  <TD>
                    <input
                      type="checkbox"
                      aria-label={`Select bill ${r.billNumber}`}
                      checked={isChecked}
                      onChange={() => toggleOne(r.id)}
                    />
                  </TD>
                )}
                <TD mono>
                  <Link
                    href={`/bills/${r.id}`}
                    style={{ color: "var(--ink)", textDecoration: "none" }}
                  >
                    {r.billNumber}
                  </Link>
                </TD>
                <TD>{r.vendorName}</TD>
                <TD>{r.clientName}</TD>
                <TD>{r.entityName}</TD>
                <TD>{r.bankAccountName}</TD>
                <TD>{formatDate(r.billDate)}</TD>
                <TD>{formatDate(r.dueDate)}</TD>
                <TD num neg={isOverdue}>
                  {r.daysOverdue <= 0 ? "—" : r.daysOverdue}
                </TD>
                <TD>{BUCKET_LABEL[r.bucket]}</TD>
                <TD num neg={isOverdue}>
                  {formatMoney(r.balanceDue, "USD", {
                    compact: true,
                    paren: true,
                    hideCurrency: true,
                  })}
                </TD>
                <TD>
                  <Pill variant={statusVariant(r.status)}>
                    {statusLabel(r.status)}
                  </Pill>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      {selectMode && (
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
          style={{
            position: "sticky",
            bottom: 0,
            background: STATUS_BG[impact],
            borderTop: `1px solid ${STATUS_COLOR[impact]}`,
            color: STATUS_COLOR[impact],
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
            zIndex: 5,
          }}
        >
          <Footer
            label={`${selected.size} bill${selected.size === 1 ? "" : "s"} selected`}
            value={formatMoney(selectedTotal, "USD", { compact: true, paren: true })}
            tone={STATUS_COLOR[impact]}
          />
          <Footer
            label="Current cash"
            value={formatMoney(cashOnHand, "USD", { compact: true, paren: true })}
            tone={STATUS_COLOR[impact]}
            muted
          />
          <Footer
            label="Cash after payment run"
            value={formatMoney(cashAfter, "USD", { compact: true, paren: true })}
            tone={STATUS_COLOR[impact]}
          />
          <span
            className="inline-flex items-center gap-1.5 ml-auto text-[12px]"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: STATUS_COLOR[impact] }}
            />
            {STATUS_LABEL[impact]}
          </span>
        </div>
      )}
    </div>
  );
}

function Footer({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className="text-[10.5px] uppercase"
        style={{
          letterSpacing: "0.06em",
          color: tone,
          opacity: muted ? 0.7 : 1,
          fontFamily: "var(--font-sans)",
        }}
      >
        {label}
      </span>
      <span
        className="text-[15px] font-semibold"
        style={{ color: tone, opacity: muted ? 0.85 : 1 }}
      >
        {value}
      </span>
    </div>
  );
}
