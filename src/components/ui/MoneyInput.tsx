"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";

const labelClasses = "text-[11.5px]";
const labelStyle = { color: "var(--ink-3)" } as const;
const inputClasses = "px-2.5 py-1.5 text-[13px] rounded-md outline-none text-right";

const inputStyle = {
  background: "var(--paper)",
  border: "1px solid var(--line-2)",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
} as const;

function normalize(raw: string): string {
  // Strip everything except digits, "-" (leading only), and a single ".".
  if (!raw) return "";
  let s = raw.replace(/[^0-9.\-]/g, "");
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  // Keep only first "."
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return (neg ? "-" : "") + s;
}

function formatWithCommas(raw: string): string {
  if (!raw) return "";
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = body.split(".");
  if (intPart === "" && decPart === undefined) return negative ? "-" : "";
  const intFmt = intPart === "" ? "" : Number(intPart).toLocaleString("en-US");
  const out = decPart !== undefined ? `${intFmt}.${decPart}` : intFmt;
  return (negative ? "-" : "") + out;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "type" | "onChange"> & {
  label?: ReactNode;
  required?: boolean;
  /** Numeric default (e.g. 1234.56) — rendered with commas. */
  defaultValue?: number | string;
  /** Submit name; the form will receive a clean decimal string. */
  name?: string;
  className?: string;
};

/**
 * A money input that visually formats with thousands separators while keeping
 * a hidden field with the raw decimal value for form submission. Falls back to
 * a plain numeric string if the parent reads the visible field.
 */
export function MoneyInput({
  label,
  required,
  defaultValue,
  name,
  className,
  placeholder,
  ...rest
}: Props) {
  const initial =
    defaultValue == null || defaultValue === ""
      ? ""
      : typeof defaultValue === "number"
        ? defaultValue.toFixed(2)
        : normalize(String(defaultValue));

  const [display, setDisplay] = useState(formatWithCommas(initial));
  const [raw, setRaw] = useState(initial);

  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label && (
        <span className={labelClasses} style={labelStyle}>
          {label}
          {required && <span style={{ color: "var(--p-review-fg)" }}> *</span>}
        </span>
      )}
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required={required}
        placeholder={placeholder ?? "0.00"}
        className={inputClasses}
        style={inputStyle}
        value={display}
        onChange={(e) => {
          const n = normalize(e.target.value);
          setRaw(n);
          setDisplay(formatWithCommas(n));
        }}
        onBlur={(e) => {
          if (raw === "" || raw === "-") return;
          // Pad to 2 decimals on blur if value parses cleanly.
          const num = Number(raw);
          if (!Number.isFinite(num)) return;
          const padded = num.toFixed(2);
          setRaw(padded);
          setDisplay(formatWithCommas(padded));
          rest.onBlur?.(e);
        }}
      />
      {name && <input type="hidden" name={name} value={raw} />}
    </label>
  );
}
