"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Row, TextareaField } from "@/components/ui/Field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { Pill } from "@/components/ui/Pill";
import {
  importJournalEntriesAction,
  INITIAL_JOURNAL_IMPORT_STATE,
} from "./actions";

const SAMPLE_CSV = `Date,Reference,Account,Description,Debit,Credit
2026-07-01,JE-IMP-1,6000,Office rent,1200.00,
2026-07-01,JE-IMP-1,1000,Cash,,1200.00
2026-07-02,JE-IMP-2,6100,Utilities,300.00,
2026-07-02,JE-IMP-2,1000,Cash,,300.00`;

export function ImportForm({ canImport }: { canImport: boolean }) {
  const [state, formAction] = useFormState(
    importJournalEntriesAction,
    INITIAL_JOURNAL_IMPORT_STATE,
  );
  const hasRun = state.staged > 0 || state.rejected > 0;

  return (
    <div className="flex flex-col gap-3.5">
      {state.error && (
        <div
          className="rounded-md px-3 py-2 text-[12.5px]"
          style={{
            background: "var(--p-review-bg)",
            color: "var(--p-review-fg)",
            border: "1px solid var(--p-review-fg)",
          }}
        >
          {state.error}
        </div>
      )}
      {hasRun && (
        <div
          className="rounded-md px-3 py-2 text-[12.5px]"
          style={{
            background: "var(--p-active-bg)",
            color: "var(--p-active-fg)",
            border: "1px solid var(--p-active-fg)",
          }}
        >
          Staged {state.staged} entr{state.staged === 1 ? "y" : "ies"} as
          draft{state.staged === 1 ? "" : "s"}
          {state.rejected > 0
            ? `, ${state.rejected} group${state.rejected === 1 ? "" : "s"} rejected.`
            : "."}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="md:col-span-2">
          <form action={formAction}>
            <Card title="Upload or paste journal-entry CSV">
              <div className="p-3.5 flex flex-col gap-3">
                <Row>
                  <label className="flex flex-col gap-1">
                    <span
                      className="text-[11.5px]"
                      style={{ color: "var(--ink-3)" }}
                    >
                      CSV file
                    </span>
                    <input
                      type="file"
                      name="file"
                      accept=".csv,text/csv"
                      className="text-[13px]"
                    />
                  </label>
                  <div />
                </Row>
                <TextareaField
                  label="…or paste CSV text"
                  name="pasted"
                  rows={8}
                  placeholder={SAMPLE_CSV}
                  help="Used only when no file is chosen."
                />
                <div className="flex justify-end">
                  <Button variant="primary" type="submit" disabled={!canImport}>
                    Validate & stage as drafts
                  </Button>
                </div>
              </div>
            </Card>
          </form>
        </div>

        <Card title="Accepted format">
          <div
            className="p-3.5 text-[12px] flex flex-col gap-2"
            style={{ color: "var(--ink-3)" }}
          >
            <div>Headers are matched case-insensitively. Columns:</div>
            <div>
              <strong style={{ color: "var(--ink-2)" }}>Date</strong> — ISO
              (2026-07-01) or US (7/1/2026).
            </div>
            <div>
              <strong style={{ color: "var(--ink-2)" }}>Reference</strong> (or
              Group) — the grouping key. Lines sharing a value become one entry.
            </div>
            <div>
              <strong style={{ color: "var(--ink-2)" }}>Account</strong> — GL
              code or account name.
            </div>
            <div>
              <strong style={{ color: "var(--ink-2)" }}>Description</strong> —
              optional per-line memo.
            </div>
            <div>
              <strong style={{ color: "var(--ink-2)" }}>Debit</strong> /{" "}
              <strong style={{ color: "var(--ink-2)" }}>Credit</strong> — exactly
              one per line; group debits must equal credits.
            </div>
            <div>
              <strong style={{ color: "var(--ink-2)" }}>Firm Entity</strong> —
              optional (code, name, or id). Must be the same across an entry's
              lines.
            </div>
            <div>
              Each valid group lands as a <strong>draft</strong> and flows
              through the normal approval path. The entry date must fall in an
              open period.
            </div>
          </div>
        </Card>
      </div>

      {state.results.length > 0 && (
        <Card title="Per-group results">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Reference / Group</TH>
                <TH>Result</TH>
                <TH>Detail</TH>
              </TR>
            </THead>
            <TBody>
              {state.results.map((r, i) => (
                <TR key={`${r.key}-${i}`}>
                  <TD mono>{r.key}</TD>
                  <TD>
                    {r.ok ? (
                      <Pill variant="active">Staged</Pill>
                    ) : (
                      <Pill variant="review">Rejected</Pill>
                    )}
                  </TD>
                  <TD style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
                    {r.ok ? (
                      <Link
                        href={`/journal/${r.entryNumber}`}
                        style={{ color: "var(--ink-2)" }}
                      >
                        {r.entryNumber}
                      </Link>
                    ) : (
                      r.error
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
