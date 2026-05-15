"use client";

import { useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import {
  SmartSelect,
  type SmartSelectOption,
} from "@/components/ui/SmartSelect";
import { OcrUpload, ReviewBanner } from "@/components/OcrUpload";
import {
  controlClassLabel,
  controlWarningInline,
  getAccountControlClass,
  type AccountControlClass,
} from "@/lib/account-controls";
import { formatMoneyInput, formatMoney, parseAmount } from "@/lib/money";
import type { OcrExtraction } from "@/lib/ocr";
import type {
  AccountingPeriod,
  Account,
  Dimension,
  DimensionValue,
  FiscalPeriod,
  Office,
} from "@/lib/types";
import { PeriodStatusBanner } from "@/components/PeriodStatusBanner";
import { createEntry, type CreateEntryState } from "./actions";

type Line = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  dimensions: Record<string, string>;
  /** Counterpart firm entity (office) — marks this line as intercompany. */
  counterpartEntityId: string;
};

function blankLine(): Line {
  return {
    accountId: "",
    description: "",
    debit: "",
    credit: "",
    dimensions: {},
    counterpartEntityId: "",
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
  accountingPeriods,
  firmEntities,
  today,
  dimensionsWithValues,
}: {
  accounts: Account[];
  periods: FiscalPeriod[];
  accountingPeriods: AccountingPeriod[];
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
  // Header-level dimensions (applied to every line at submit time).
  // Moved out of the per-line cells so the spreadsheet stays compact —
  // single Department field at the top instead of one selector per row.
  const [headerDimensions, setHeaderDimensions] = useState<
    Record<string, string>
  >({});

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
          counterpartEntityId: "",
        }));
        // Always keep at least 2 rows.
        while (next.length < 2) next.push(blankLine());
        setLines(next);
      }
    }
  }

  // No "project" concept (it was removed). Dimensions are header-level:
  // the user picks one Department for the whole JE and we apply it to
  // every line at submit time. Per-line override isn't exposed in the
  // compact view — the line cells are gone entirely.
  const headerDimensionDefs = useMemo(
    () => dimensionsWithValues.filter((d) => d.dimension.key !== "project"),
    [dimensionsWithValues],
  );
  // Kept for backwards compat with any code below that still references
  // `lineDimensions` — empty array means "render no per-line cells".
  const lineDimensions: typeof headerDimensionDefs = [];

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
  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a] as const)),
    [accounts],
  );
  const counterpartOptions = useMemo<SmartSelectOption[]>(
    () =>
      firmEntities.map((e) => ({
        value: e.id,
        label: `${e.code} — ${e.name}`,
        search: e.code,
      })),
    [firmEntities],
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
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<string>("monthly");
  const [recurringDayOfMonth, setRecurringDayOfMonth] = useState<string>("1");
  const [recurringStartDate, setRecurringStartDate] = useState<string>(today);
  const [recurringEndDate, setRecurringEndDate] = useState<string>("");

  const debitTotal = useMemo(
    () => lines.reduce((s, l) => s + parseAmount(l.debit), 0),
    [lines],
  );
  const creditTotal = useMemo(
    () => lines.reduce((s, l) => s + parseAmount(l.credit), 0),
    [lines],
  );
  const balanced = Math.abs(debitTotal - creditTotal) < 0.005 && debitTotal > 0;

  // Controlled-account detection per line — drives both the inline warning
  // badge and the pre-post confirmation summary.
  const lineControls = useMemo<Array<AccountControlClass | null>>(
    () =>
      lines.map((l) => {
        if (!l.accountId) return null;
        const a = accountById.get(l.accountId);
        if (!a) return null;
        return getAccountControlClass(a);
      }),
    [lines, accountById],
  );
  const controlSummary = useMemo(() => {
    const set = new Set<AccountControlClass>();
    for (const c of lineControls) if (c) set.add(c);
    return Array.from(set);
  }, [lineControls]);
  const hasIntercompany = lines.some(
    (l) => l.counterpartEntityId && parseAmount(l.debit) + parseAmount(l.credit) > 0,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const [pendingPost, setPendingPost] = useState(false);

  function confirmPostAndSubmit() {
    setPendingPost(false);
    const fd = formRef.current;
    if (!fd) return;
    const bypass = fd.querySelector<HTMLInputElement>(
      "input[name=bypassControlWarning]",
    );
    if (bypass) bypass.value = "1";
    const action = fd.querySelector<HTMLInputElement>("input[name=action]");
    if (action) action.value = "post";
    fd.requestSubmit();
  }

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
  } minmax(150px, 0.8fr) 110px 110px 32px`;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3.5 px-6 py-3.5 pb-8"
    >
      <input type="hidden" name="bypassControlWarning" value="0" />
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
      <PeriodStatusBanner date={entryDate} periods={accountingPeriods} />

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
          {/* Header-level dimensions (currently just Department). Applied
              to every line at submit time so the spreadsheet rows can
              stay narrow. */}
          {headerDimensionDefs.map(({ dimension, values }) => (
            <div key={dimension.id} className="flex flex-col gap-1">
              <span style={HEADER_LABEL}>{dimension.label}</span>
              <SmartSelect
                name={`headerDim[${dimension.key}]`}
                value={headerDimensions[dimension.key] ?? ""}
                onChange={(v) =>
                  setHeaderDimensions((prev) => ({
                    ...prev,
                    [dimension.key]: v,
                  }))
                }
                options={values.map((vv) => ({
                  value: vv.id,
                  label: vv.label,
                  search: vv.code,
                }))}
                emptyLabel="—"
                clearable
                triggerStyle={HEADER_INPUT}
                ariaLabel={dimension.label}
              />
            </div>
          ))}
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
            className="px-3 py-1.5"
            style={{ ...HEADER_LABEL, fontSize: 10.5 }}
            title="Counterpart firm entity for intercompany transactions"
          >
            Counterpart
          </div>
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
            style={{
              borderTop: i === 0 ? "none" : "1px solid var(--line)",
            }}
          >
          <div
            className="grid items-stretch"
            style={{ gridTemplateColumns: cols }}
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
              <SmartSelect
                name={`lines[${i}][counterpartEntityId]`}
                value={line.counterpartEntityId}
                onChange={(v) => updateLine(i, { counterpartEntityId: v })}
                options={counterpartOptions}
                emptyLabel="—"
                clearable
                variant="cell"
                ariaLabel="Counterpart entity"
              />
            </div>
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
          {lineControls[i] ? (
            <div
              className="px-3 py-1"
              style={{
                fontSize: 11,
                color: "var(--p-review-fg)",
                background: "var(--p-review-bg)",
                borderTop: "1px dashed var(--line)",
              }}
            >
              {controlWarningInline(lineControls[i]!)}
            </div>
          ) : null}
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
          <div />
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

      <div
        className="rounded-md"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--line)",
        }}
      >
        <label
          className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
          style={{
            borderBottom: isRecurring ? "1px solid var(--line)" : "none",
            fontSize: 12.5,
            color: "var(--ink)",
          }}
        >
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            style={{ accentColor: "var(--ink)" }}
          />
          <span style={{ fontWeight: 500 }}>Recurring</span>
          <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>
            Save as a template. Generated entries land as drafts dated by the
            schedule below — they won't post automatically.
          </span>
        </label>
        {isRecurring && (
          <div
            className="grid gap-3 px-3 py-2.5"
            style={{
              gridTemplateColumns:
                "minmax(140px,160px) minmax(120px,140px) minmax(150px,180px) minmax(150px,180px)",
            }}
          >
            <label className="flex flex-col gap-1">
              <span style={HEADER_LABEL}>Frequency</span>
              <select
                name="recurringFrequency"
                value={recurringFrequency}
                onChange={(e) => setRecurringFrequency(e.target.value)}
                style={HEADER_INPUT}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
                <option value="custom">Custom (monthly)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span style={HEADER_LABEL}>Day of month</span>
              <input
                type="number"
                name="recurringDayOfMonth"
                min={1}
                max={28}
                value={recurringDayOfMonth}
                onChange={(e) => setRecurringDayOfMonth(e.target.value)}
                style={HEADER_INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span style={HEADER_LABEL}>Start date</span>
              <input
                type="date"
                name="recurringNextDate"
                value={recurringStartDate}
                onChange={(e) => setRecurringStartDate(e.target.value)}
                style={HEADER_INPUT}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span style={HEADER_LABEL}>End date (optional)</span>
              <input
                type="date"
                name="recurringEndDate"
                value={recurringEndDate}
                onChange={(e) => setRecurringEndDate(e.target.value)}
                style={HEADER_INPUT}
              />
            </label>
          </div>
        )}
      </div>

      {/* Hidden action so we can re-trigger requestSubmit() from the
          confirmation step without losing which button was clicked. */}
      <input type="hidden" name="action" value="draft" />

      <div className="flex gap-2 items-center">
        {isRecurring ? (
          <Button
            variant="primary"
            type="submit"
            onClick={() => {
              const a = formRef.current?.querySelector<HTMLInputElement>(
                "input[name=action]",
              );
              if (a) a.value = "template";
            }}
          >
            Save template
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              type="submit"
              onClick={() => {
                const a = formRef.current?.querySelector<HTMLInputElement>(
                  "input[name=action]",
                );
                if (a) a.value = "draft";
              }}
            >
              Save as draft
            </Button>
            <Button
              variant="primary"
              type={controlSummary.length > 0 ? "button" : "submit"}
              onClick={(e) => {
                const a = formRef.current?.querySelector<HTMLInputElement>(
                  "input[name=action]",
                );
                if (a) a.value = "post";
                if (controlSummary.length > 0) {
                  e.preventDefault();
                  setPendingPost(true);
                }
              }}
            >
              Save & post
            </Button>
          </>
        )}
        <ButtonLink variant="ghost" href="/journal">
          Cancel
        </ButtonLink>
      </div>

      {pendingPost && controlSummary.length > 0 && (
        <div
          className="rounded-md px-3 py-2.5 flex flex-col gap-2"
          style={{
            background: "var(--p-review-bg)",
            color: "var(--p-review-fg)",
            border: "1px solid var(--p-review-fg)",
            fontSize: 12.5,
          }}
          role="alertdialog"
        >
          <div style={{ fontWeight: 600 }}>
            This entry posts directly to{" "}
            {controlSummary.map(controlClassLabel).join(" / ")} accounts. Are you
            sure?
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.85 }}>
            These accounts are normally updated by invoices, bills, or bank
            transactions. Posting directly is recorded as an audit-trail
            override (bypassControlWarning = true).
          </div>
          <div className="flex gap-2 items-center mt-1">
            <Button
              variant="primary"
              type="button"
              onClick={confirmPostAndSubmit}
            >
              Yes, post anyway
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setPendingPost(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {hasIntercompany && (
        <div
          className="rounded-md px-3 py-2 text-[12px]"
          style={{
            background: "var(--p-active-bg)",
            color: "var(--p-active-fg)",
            border: "1px solid var(--p-active-fg)",
          }}
        >
          Intercompany entry — counterpart entity is set on at least one
          line. It will appear on the intercompany report and be eligible
          for elimination.
        </div>
      )}
    </form>
  );
}

function cellBorder(hasLeftBorder: boolean): React.CSSProperties {
  return {
    borderLeft: hasLeftBorder ? "1px solid var(--line)" : "none",
  };
}
