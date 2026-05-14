"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { formatDate } from "@/lib/format";
import { formatUSD } from "@/lib/money";

import { generateChargebackInvoiceAction } from "./actions";

type Row = {
  id: string;
  billNumber: string;
  billDate: string;
  vendorName: string;
  vendorId: string;
  chargebackType: "cost" | "markup" | "fixed" | "included";
  methodLabel: string;
  rebillAmount: number | null;
};

export function PendingChargebacksCard({
  customerId,
  rows,
}: {
  customerId: string;
  rows: Row[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  };

  const selectedTotal = useMemo(
    () =>
      rows
        .filter((r) => selected.has(r.id))
        .reduce((s, r) => s + (r.rebillAmount ?? 0), 0),
    [rows, selected],
  );

  return (
    <Card
      title="Pending chargebacks"
      actions={
        <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
          {rows.length} bill{rows.length === 1 ? "" : "s"} ready to rebill
        </span>
      }
    >
      <form action={generateChargebackInvoiceAction}>
        <input type="hidden" name="customerId" value={customerId} />
        <Table>
          <THead>
            <TR hover={false}>
              <TH>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </TH>
              <TH>Bill #</TH>
              <TH>Date</TH>
              <TH>Vendor</TH>
              <TH>Method</TH>
              <TH num>Rebill amount</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const isChecked = selected.has(r.id);
              return (
                <TR key={r.id} href={`/bills/${r.id}`}>
                  <TD>
                    <input
                      type="checkbox"
                      name="billIds"
                      value={r.id}
                      checked={isChecked}
                      onChange={() => toggle(r.id)}
                      aria-label={`Select ${r.billNumber}`}
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
                  <TD>{formatDate(r.billDate)}</TD>
                  <TD>{r.vendorName}</TD>
                  <TD style={{ color: "var(--ink-3)" }}>{r.methodLabel}</TD>
                  <TD num>
                    {r.rebillAmount != null
                      ? formatUSD(r.rebillAmount, { paren: true })
                      : "—"}
                  </TD>
                </TR>
              );
            })}
            <TR total hover={false}>
              <TD>{""}</TD>
              <TD>{""}</TD>
              <TD>{""}</TD>
              <TD>{""}</TD>
              <TD>Selected total</TD>
              <TD num>{formatUSD(selectedTotal, { paren: true })}</TD>
            </TR>
          </TBody>
        </Table>
        <div className="p-3.5 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={selected.size === 0}
          >
            Generate billback invoice
          </Button>
        </div>
      </form>
    </Card>
  );
}
