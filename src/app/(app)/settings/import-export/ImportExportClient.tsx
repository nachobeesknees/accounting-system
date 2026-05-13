"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { processCsvAction } from "./actions";
import { INITIAL_IMPORT_STATE, type ImportState } from "./types";

type TypeOption = {
  key: string;
  label: string;
  description: string;
};

export function ImportExportClient({ types }: { types: TypeOption[] }) {
  const [activeType, setActiveType] = useState<string>(types[0]?.key ?? "");
  const [state, action, isPending] = useActionState<ImportState, FormData>(
    processCsvAction,
    INITIAL_IMPORT_STATE,
  );

  const showResults = state.totalRows > 0 || state.error;

  return (
    <div className="flex flex-col gap-3.5">
      <Card title="Data type">
        <div className="flex gap-2 flex-wrap">
          {types.map((t) => {
            const active = t.key === activeType;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveType(t.key)}
                className="px-3 py-1.5 text-[13px] rounded-md"
                style={{
                  border: "1px solid var(--line-2)",
                  background: active ? "var(--raised)" : "transparent",
                  color: active ? "var(--ink)" : "var(--ink-2)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {types.find((t) => t.key === activeType) && (
          <p
            className="mt-2"
            style={{ fontSize: 12.5, color: "var(--ink-3)" }}
          >
            {types.find((t) => t.key === activeType)!.description}
          </p>
        )}
      </Card>

      <Card title="Downloads">
        <div className="flex flex-col gap-2 text-[13px]">
          <a
            href={`/api/csv/${activeType}/template`}
            className="px-3 py-1.5 rounded-md inline-flex w-fit"
            style={{
              border: "1px solid var(--line-2)",
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            ↓ Download template CSV
          </a>
          <a
            href={`/api/csv/${activeType}/export`}
            className="px-3 py-1.5 rounded-md inline-flex w-fit"
            style={{
              border: "1px solid var(--line-2)",
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            ↓ Export current data
          </a>
          <div style={{ color: "var(--ink-4)", fontSize: 11.5 }}>
            Templates include a single example row and column documentation in
            the headers.
          </div>
        </div>
      </Card>

      <form action={action}>
        <input type="hidden" name="type" value={activeType} />
        <Card title="Upload CSV">
          <div className="flex flex-col gap-3">
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="text-[13px]"
            />
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="commit" />
              <span style={{ color: "var(--ink-2)" }}>
                Commit to database (otherwise: dry-run validation only)
              </span>
            </label>
            <div className="flex justify-end">
              <Button variant="primary" type="submit" disabled={isPending}>
                {isPending ? "Processing…" : "Process CSV"}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      {showResults && (
        <Card
          title={
            state.error
              ? "Upload error"
              : state.dryRun
                ? `Dry run — ${state.fileName ?? ""}`
                : `Imported — ${state.fileName ?? ""}`
          }
          actions={
            state.totalRows > 0 ? (
              <>
                <Pill variant="active">{state.okCount} ok</Pill>
                {state.failCount > 0 && (
                  <Pill variant="review">{state.failCount} errors</Pill>
                )}
              </>
            ) : null
          }
        >
          {state.error ? (
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
          ) : (
            <Table>
              <THead>
                <TR hover={false}>
                  <TH>Row</TH>
                  <TH>Status</TH>
                  <TH>Result / error</TH>
                  <TH>Key column</TH>
                  <TH>Sample</TH>
                </TR>
              </THead>
              <TBody>
                {state.rows.map((r) => {
                  const firstField = Object.keys(r.values)[0] ?? "";
                  const sample = Object.entries(r.values)
                    .slice(1, 4)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(" · ");
                  return (
                    <TR key={r.index}>
                      <TD mono>{r.index}</TD>
                      <TD>
                        {r.result.ok ? (
                          <Pill variant="active">OK</Pill>
                        ) : (
                          <Pill variant="review">Error</Pill>
                        )}
                      </TD>
                      <TD style={{ color: "var(--ink-3)" }}>
                        {r.result.ok
                          ? state.dryRun
                            ? "Would insert"
                            : "Inserted"
                          : r.result.error}
                      </TD>
                      <TD mono>{r.values[firstField] ?? ""}</TD>
                      <TD style={{ color: "var(--ink-4)", fontSize: 11.5 }}>
                        {sample}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
