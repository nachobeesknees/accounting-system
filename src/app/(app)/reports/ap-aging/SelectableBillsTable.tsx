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

export function SelectableBillsTable({ rows }: { rows: SelectableBillRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

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
          {selected.size === 0
            ? `${rows.length} open bills`
            : `${selected.size} selected · ${formatMoney(selectedTotal, "USD", { compact: true, paren: true })}`}
        </div>
        <div className="flex gap-2">
          <a
            href={csvHref}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium no-underline"
            style={{
              background: "var(--raised)",
              color: "var(--ink)",
              border: "1px solid var(--line-2)",
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
            Clear
          </Button>
        </div>
      </div>
      <Table>
        <THead>
          <TR hover={false}>
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
            <TH>Bill #</TH>
            <TH>Vendor</TH>
            <TH>Client</TH>
            <TH>Entity</TH>
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
              <TD colSpan={11} style={{ color: "var(--ink-3)" }}>
                No open bills.
              </TD>
            </TR>
          )}
          {rows.map((r) => {
            const isOverdue = r.daysOverdue > 0;
            return (
              <TR key={r.id} hover={false}>
                <TD>
                  <input
                    type="checkbox"
                    aria-label={`Select bill ${r.billNumber}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                  />
                </TD>
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
    </div>
  );
}
