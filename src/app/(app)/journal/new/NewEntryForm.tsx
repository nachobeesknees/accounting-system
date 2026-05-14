"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import {
  SmartSelect,
  type SmartSelectOption,
} from "@/components/ui/SmartSelect";
import { OcrUpload, ReviewBanner } from "@/components/OcrUpload";
import { formatMoneyInput, formatMoney, parseAmount } from "@/lib/money";
import type { OcrExtraction } from "@/lib/ocr";
import type {
  Account,
  Dimension,
  DimensionValue,
  FiscalPeriod,
  Office,
} from "@/lib/types";
import { createEntry, type CreateEntryState } from "./actions";

type Line = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  dimensions: Record<string, string>;
};

function blankLine(): Line {
  return {
    accountId: "",
    description: "",
    debit: "",
    credit: "",
    dimensions: {},
  };
}

const INITIAL_STATE: CreateEntryState = { error: null };

const HEADER_LABEL: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-3)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 500,
};

const CELL_INPUT: React.CSSProperties = {
  background: "transparent",
  border: "none",
  outline: "none",
  width: "100%",
  padding: "4px 8px",
  fontSize: 12.5,
  color: "var(--ink)",
};

const NUM_CELL_INPUT: React.CSSProperties = {
  ...CELL_INPUT,
  textAlign: "right",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
};

const HEADER_INPUT: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line-2)",
  borderRadius: 6,
  outline: "none",
  padding: "5px 8px",
  fontSize: 12.5,
  color: "var(--ink)",
};

export function NewEntryForm({
  accounts,
  periods,
  firmEntities,
  today,
  dimensionsWithValues,
}: {
  accounts: Account[];
  periods: FiscalPeriod[];
  firmEntities: Office[];
  today: string;
  dimensionsWithValues: Array<{ dimension: Dimension; values: DimensionValue[] }>;
}) {
  const [state, formAction] = useFormState(createEntry, INITIAL_STATE);
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine()]);
  const [entryDate, setEntryDate] = useState(today);
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [showReview, setShowReview] = useState(false);

  function findAccountId(token: string | undefined): string {
    if (!token) return "";
    const needle = token.toLowerCase().trim();
    const byCode = accounts.find((a) => a.code.toLowerCase() === needle);
    if (byCode) return byCode.id;
    const byName = accounts.find(
      (a) =>
        a.name.toLowerCase() === needle ||
        a.name.toLowerCase().includes(needle) ||
        needle.includes(a.name.toLowerCase()),
    );
    return byName?.id ?? "";
  }

  function applyOcr(data: OcrExtraction) {
    setShowReview(true);
    if (data.date && entryDate === today) setEntryDate(data.date);
    if (data.reference && reference === "") setReference(data.reference);
    if (data.description && description === "") setDescription(data.description);
    if (data.journalLines && data.journalLines.length > 0) {
      const userEmpty = lines.every(
        (l) =>
          l.description.trim() === "" &&
          l.accountId === "" &&
          parseAmount(l.debit) === 0 &&
          parseAmount(l.credit) === 0,
      );
      if (userEmpty) {
        const next: Line[] = data.journalLines.map((jl) => ({
          accountId: findAccountId(jl.account),
          description: jl.memo ?? "",
          debit: jl.debit != null && jl.debit > 0 ? jl.debit.toFixed(2) : "",
          credit: jl.credit != null && jl.credit > 0 ? jl.credit.toFixed(2) : "",
          dimensions: {},
        }));
        // Always keep at least 2 rows.
        while (next.length < 2) next.push(blankLine());
        setLines(next);
      }
    }
  }

  // No "project" concept. Only line-level dimensions (e.g. department) are
  // rendered, and only as inline cells in the spreadsheet — not as stacked
  // selects inside the account cell.
  const lineDimensions = useMemo(
    () => dimensionsWithValues.filter((d) => d.dimension.key !== "project"),
    [dimensionsWithValues],
  );

  const firmEntityOptions = useMemo<SmartSelectOption[]>(
    () =>
      firmEntities.map((e) => ({
        value: e.id,
        label: `${e.code} — ${e.name}`,
        search: e.code,
      })),
    [firmEntities],
  );
  const periodOptions = useMemo<SmartSelectOption[]>(
    () =>
      periods.map((p) => ({
        value: p.id,
        label: p.name,
        description: `(${p.status})`,
      })),
    [periods],
  );
  const accountOptions = useMemo<SmartSelectOption[]>(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.code} — ${a.name}`,
        search: a.code,
      })),
    [accounts],
  );
  const dimensionOptions = useMemo(() => {
    const m = new Map<string, SmartSelectOption[]>();
    for (const { dimension, values } of lineDimensions) {
      m.set(
        dimension.key,
        values.map((v) => ({
          value: v.id,
          label: v.label,
          search: v.code,
        })),
      );
    }
    return m;
  }, [lineDimensions]);

  const [firmEntityId, setFirmEntityId] = useState<string>("");
  const [fiscalPeriodId, setFiscalPeriodId] = useState<string>(periods[0]?.id ?? "");
  const [source, setSource] = useState<string>("manual");

  const debitTotal = useMemo(
    () => lines.reduce((s, l) => s + parseAmount(l.debit), 0),
    [lines],
  );
  const creditTotal = useMemo(
    () => lines.reduce((s, l) => s + parseAmount(l.credit), 0),
    [lines],
  );
  const balanced = Math.abs(debitTotal - creditTotal) < 0.005 && debitTotal > 0;

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function setDebit(i: number, value: string) {
    setLines((prev) =>
      prev.map((l, idx) =>
        idx === i ? { ...l, debit: value, credit: value ? "" : l.credit } : l,
      ),
    );
  }

  function setCredit(i: number, value: string) {
    setLines((prev) =>
      prev.map((l, idx) =>
        idx === i ? { ...l, credit: value, debit: value ? "" : l.debit } : l,
      ),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }

  function removeLine(i: number) {
    setLines((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i),
    );
  }

  // Column widths for the spreadsheet. The account+description block carries
  // the slack; everything else has a fixed width so rows align cleanly.
  const dimColCount = lineDimensions.length;
  const cols = `40px minmax(220px, 1.5fr) minmax(180px, 2fr) ${
    dimColCount > 0 ? "repeat(" + dimColCount + ", minmax(120px, 0.7fr))" : ""
  } 110px 110px 32px`;

  return (
    <form action={formAction} className="flex flex-col gap-3.5 px-6 py-3.5 pb-8">
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

      <OcrUpload formType="journal_entry" onExtracted={applyOcr} />
      {showReview && <ReviewBanner onDismiss={() => setShowReview(false)} />}

      {/* Header — single dense row, no Card chrome around the inputs. */}
      <div
        className="rounded-md"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--line)",
        }}
      >
        <div
          className="grid gap-3 px-3 py-2.5"
          style={{
            gridTemplateColumns:
              "minmax(130px,140px) minmax(160px,180px) minmax(180px,1fr) minmax(180px,1fr) minmax(160px,200px) minmax(120px,140px)",
          }}
        >
          <label className="flex flex-col gap-1">
            <span style={HEADER_LABEL}>Date</span>
            <input
              type="date"
              name="entryDate"
              required
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              style={HEADER_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={HEADER_LABEL}>Reference</span>
            <input
              type="text"
              name="reference"
              placeholder="Optional"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              style={HEADER_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 col-span-1">
            <span style={HEADER_LABEL}>Memo</span>
            <input
              type="text"
              name="description"
              required
              placeholder="What is this entry for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={HEADER_INPUT}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span style={HEADER_LABEL}>Entity</span>
            <SmartSelect
              name="firmEntityId"
              value={firmEntityId}
              onChange={setFirmEntityId}
              options={firmEntityOptions}
              emptyLabel="— Active scope —"
              clearable
              triggerStyle={HEADER_INPUT}
              ariaLabel="Entity"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span style={HEADER_LABEL}>Period</span>
            <SmartSelect
              name="fiscalPeriodId"
              value={fiscalPeriodId}
              onChange={setFiscalPeriodId}
              options={periodOptions}
              emptyLabel="— None —"
              clearable
              triggerStyle={HEADER_INPUT}
              ariaLabel="Fiscal period"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span style={HEADER_LABEL}>Source</span>
            <SmartSelect
              name="source"
              value={source}
              onChange={setSource}
              options={[
                { value: "manual", label: "Manual" },
                { value: "invoice", label: "Invoice" },
                { value: "bill", label: "Bill" },
                { value: "reconciliation", label: "Reconciliation" },
              ]}
              triggerStyle={HEADER_INPUT}
              ariaLabel="Source"
            />
          </div>
        </div>
      </div>

      {/* Spreadsheet — every row is one grid, so columns line up perfectly. */}
      <div
        className="rounded-md overflow-hidden"
        style={{ border: "1px solid var(--line)", background: "var(--paper)" }}
      >
        {/* Column headers */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: cols,
            background: "var(--rail)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div
            className="px-3 py-1.5"
            style={{ ...HEADER_LABEL, fontSize: 10.5 }}
          >
            #
          </div>
          <div
            className="px-3 py-1.5"
            style={{ ...HEADER_LABEL, fontSize: 10.5 }}
          >
            Account
          </div>
          <div
            className="px-3 py-1.5"
            style={{ ...HEADER_LABEL, fontSize: 10.5 }}
          >
            Memo
          </div>
          {lineDimensions.map(({ dimension }) => (
            <div
              key={dimension.id}
              className="px-3 py-1.5"
              style={{ ...HEADER_LABEL, fontSize: 10.5 }}
            >
              {dimension.label}
            </div>
          ))}
          <div
            className="px-3 py-1.5 text-right"
            style={{
              ...HEADER_LABEL,
              fontSize: 10.5,
              fontFamily: "var(--font-mono)",
            }}
          >
            Debit
          </div>
          <div
            className="px-3 py-1.5 text-right"
            style={{
              ...HEADER_LABEL,
              fontSize: 10.5,
              fontFamily: "var(--font-mono)",
            }}
          >
            Credit
          </div>
          <div className="px-2 py-1.5" />
        </div>

        {/* Data rows */}
        {lines.map((line, i) => (
          <div
            key={i}
            className="grid items-stretch"
            style={{
              gridTemplateColumns: cols,
              borderTop: i === 0 ? "none" : "1px solid var(--line)",
            }}
          >
            <div
              className="flex items-center px-3"
              style={{
                color: "var(--ink-3)",
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                fontSize: 12,
              }}
            >
              {i + 1}
            </div>
            <div className="flex items-center" style={cellBorder(false)}>
              <SmartSelect
                name={`lines[${i}][accountId]`}
                value={line.accountId}
                onChange={(v) => updateLine(i, { accountId: v })}
                options={accountOptions}
                emptyLabel="— Select account —"
                variant="cell"
                ariaLabel="Account"
              />
            </div>
            <div className="flex items-center" style={cellBorder(true)}>
              <input
                type="text"
                name={`lines[${i}][description]`}
                value={line.description}
                onChange={(e) =>
                  updateLine(i, { description: e.target.value })
                }
                placeholder="Memo"
                style={CELL_INPUT}
              />
            </div>
            {lineDimensions.map(({ dimension }) => (
              <div
                key={dimension.id}
                className="flex items-center"
                style={cellBorder(true)}
              >
                <SmartSelect
                  name={`lines[${i}][dim][${dimension.key}]`}
                  value={line.dimensions[dimension.key] ?? ""}
                  onChange={(v) =>
                    updateLine(i, {
                      dimensions: { ...line.dimensions, [dimension.key]: v },
                    })
                  }
                  options={dimensionOptions.get(dimension.key) ?? []}
                  emptyLabel="—"
                  clearable
                  variant="cell"
                  ariaLabel={dimension.label}
                />
              </div>
            ))}
            <div className="flex items-center" style={cellBorder(true)}>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                name={`lines[${i}][debit]`}
                value={line.debit}
                onChange={(e) =>
                  setDebit(i, formatMoneyInput(e.target.value))
                }
                placeholder="0.00"
                style={NUM_CELL_INPUT}
              />
            </div>
            <div className="flex items-center" style={cellBorder(true)}>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                name={`lines[${i}][credit]`}
                value={line.credit}
                onChange={(e) =>
                  setCredit(i, formatMoneyInput(e.target.value))
                }
                placeholder="0.00"
                style={NUM_CELL_INPUT}
              />
            </div>
            <div className="flex items-center justify-center" style={cellBorder(true)}>
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 2}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--ink-3)",
                  cursor: lines.length <= 2 ? "not-allowed" : "pointer",
                  opacity: lines.length <= 2 ? 0.4 : 1,
                  padding: 4,
                  fontSize: 14,
                  lineHeight: 1,
                }}
                aria-label={`Remove line ${i + 1}`}
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {/* Add row */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: cols,
            borderTop: "1px solid var(--line)",
          }}
        >
          <button
            type="button"
            onClick={addLine}
            className="col-span-full text-left px-3 py-1.5"
            style={{
              gridColumn: "1 / -1",
              background: "transparent",
              border: "none",
              color: "var(--ink-3)",
              cursor: "pointer",
              fontSize: 11.5,
            }}
          >
            + Add line
          </button>
        </div>

        {/* Totals */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: cols,
            background: "var(--rail)",
            borderTop: "1px solid var(--line)",
            fontWeight: 600,
          }}
        >
          <div />
          <div
            className="px-3 py-1.5 flex items-center gap-2"
            style={{ fontSize: 12 }}
          >
            <span style={{ color: "var(--ink-3)" }}>Totals</span>
            <Pill variant={balanced ? "active" : "review"}>
              {balanced ? "Balanced" : "Unbalanced"}
            </Pill>
          </div>
          <div />
          {lineDimensions.map(({ dimension }) => (
            <div key={dimension.id} />
          ))}
          <div
            className="px-3 py-1.5 text-right"
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              fontSize: 12,
              color: "var(--ink)",
            }}
          >
            {formatMoney(debitTotal, "USD")}
          </div>
          <div
            className="px-3 py-1.5 text-right"
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              fontSize: 12,
              color: "var(--ink)",
            }}
          >
            {formatMoney(creditTotal, "USD")}
          </div>
          <div />
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <Button variant="secondary" type="submit" name="action" value="draft">
          Save as draft
        </Button>
        <Button variant="primary" type="submit" name="action" value="post">
          Save & post
        </Button>
        <ButtonLink variant="ghost" href="/journal">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

function cellBorder(hasLeftBorder: boolean): React.CSSProperties {
  return {
    borderLeft: hasLeftBorder ? "1px solid var(--line)" : "none",
  };
}
