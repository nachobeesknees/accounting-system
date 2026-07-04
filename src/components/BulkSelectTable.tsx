"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";

export type BulkRow = {
  /** DB id submitted with the bulk action. */
  id: string;
  /** Row detail-page href (whole-row click navigation). */
  href?: string;
  /** The cells rendered after the checkbox column. */
  cells: ReactNode;
};

export type BulkAction = {
  /** Server action (FormData) invoked with the selected ids. */
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  /** Field name the ids are submitted under (e.g. "entryIds"). */
  fieldName: string;
  variant?: "primary" | "secondary";
};

/**
 * A table with a leading checkbox column and a sticky bulk-action bar.
 * Mirrors the pay-run multi-select pattern: selection lives in client state
 * and is submitted as repeated hidden inputs to a server action. The server
 * action re-enforces every per-item permission / SoD guard — the selection
 * is never trusted.
 *
 * `header` is the existing THead row content (the cells AFTER the checkbox
 * column). Totals or footer rows can be passed via `footer`.
 */
export function BulkSelectTable({
  rows,
  header,
  footer,
  actions,
  emptySelectionHint,
}: {
  rows: BulkRow[];
  header: ReactNode;
  footer?: ReactNode;
  actions: BulkAction[];
  emptySelectionHint?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allOn = allIds.length > 0 && selected.size === allIds.length;
  const someOn = selected.size > 0 && !allOn;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setSelected(on ? new Set(allIds) : new Set());
  }

  const selectedArr = Array.from(selected);

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <THead>
          <TR hover={false}>
            <TH style={{ width: 28 }}>
              <input
                type="checkbox"
                checked={allOn}
                ref={(el) => {
                  if (el) el.indeterminate = someOn;
                }}
                onChange={(e) => toggleAll(e.currentTarget.checked)}
                aria-label="Select all rows"
              />
            </TH>
            {header}
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id} href={r.href}>
              <TD>
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label={`Select row ${r.id}`}
                />
              </TD>
              {r.cells}
            </TR>
          ))}
          {footer}
        </TBody>
      </Table>

      <div
        className="flex items-center gap-2 flex-wrap no-print"
        style={{ minHeight: 34 }}
      >
        <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
          {selected.size} selected
        </span>
        {actions.map((a) => (
          <form key={a.label} action={a.action}>
            {selectedArr.map((id) => (
              <input key={id} type="hidden" name={a.fieldName} value={id} />
            ))}
            <button
              type="submit"
              disabled={selected.size === 0}
              style={{
                fontSize: 12.5,
                padding: "5px 12px",
                borderRadius: 5,
                fontWeight: 600,
                cursor: selected.size === 0 ? "not-allowed" : "pointer",
                opacity: selected.size === 0 ? 0.5 : 1,
                background:
                  a.variant === "primary" ? "var(--accent)" : "var(--paper)",
                color:
                  a.variant === "primary"
                    ? "var(--accent-fg)"
                    : "var(--ink-2)",
                border:
                  a.variant === "primary"
                    ? "1px solid var(--accent)"
                    : "1px solid var(--line-2)",
              }}
            >
              {a.label}
            </button>
          </form>
        ))}
        {selected.size === 0 && emptySelectionHint && (
          <span className="text-[11.5px]" style={{ color: "var(--ink-4)" }}>
            {emptySelectionHint}
          </span>
        )}
      </div>
    </div>
  );
}
