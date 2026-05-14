"use client";

import { useState, useEffect } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { formatMoneyInput } from "@/lib/money";

const labelClasses = "text-[11.5px]";
const inputClasses = "px-2.5 py-1.5 text-[13px] rounded-md outline-none";

const inputStyle: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line-2)",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
};

function stripGrouping(value: string): string {
  return value.replace(/,/g, "");
}

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "defaultValue" | "value" | "onChange"
> & {
  label?: ReactNode;
  required?: boolean;
  name: string;
  defaultValue?: string | number | null;
  /** Hidden input name actually submitted; defaults to `name`. */
  submitName?: string;
  /** Optional help text under the input. */
  help?: ReactNode;
};

/**
 * Money input that displays comma-grouped digits as the user types and
 * submits the raw numeric string via a hidden input. Drop-in replacement
 * for Field on dollar-amount fields.
 */
export function MoneyInput({
  label,
  required,
  name,
  defaultValue,
  submitName,
  help,
  className,
  ...rest
}: Props) {
  const init =
    defaultValue == null || defaultValue === ""
      ? ""
      : formatMoneyInput(String(defaultValue));
  const [display, setDisplay] = useState(init);

  useEffect(() => {
    setDisplay(init);
    // Only re-init when defaultValue truly changes — controlled via key on
    // the parent if needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue]);

  const raw = stripGrouping(display);

  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label && (
        <span className={labelClasses} style={{ color: "var(--ink-3)" }}>
          {label}
          {required && <span style={{ color: "var(--p-review-fg)" }}> *</span>}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onChange={(e) => setDisplay(formatMoneyInput(e.target.value))}
        className={inputClasses}
        style={inputStyle}
        required={required}
        {...rest}
      />
      <input type="hidden" name={submitName ?? name} value={raw} />
      {help && (
        <span
          className="text-[11px]"
          style={{ color: "var(--ink-4)", lineHeight: 1.4 }}
        >
          {help}
        </span>
      )}
    </label>
  );
}
