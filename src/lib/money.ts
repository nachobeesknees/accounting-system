/**
 * Money helpers. All money values are strings (numeric(15,2)) so we do
 * arithmetic by parsing to floats with care, or stay in strings for
 * display. For real DB-backed work we'd use a Decimal library; for this
 * demo the values are bounded and 2dp so float works.
 */

export function parseAmount(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  // Strip thousands separators so values typed as "1,234.56" parse correctly.
  const cleaned = value.replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatAmount(value: number | string, opts: { paren?: boolean } = {}): string {
  const n = typeof value === "string" ? parseAmount(value) : value;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n < 0) return opts.paren ? `(${formatted})` : `-${formatted}`;
  return formatted;
}

export function formatUSD(value: number | string, opts: { paren?: boolean } = {}): string {
  return `USD ${formatAmount(value, opts)}`;
}

/**
 * Currency-aware formatter. Shows `XYZ 1,234.56`, matching the JetBrains-Mono
 * money style used everywhere. Falls back to "USD" when ccy is empty so the
 * caller never has to special-case a missing column. Prefer this over
 * `formatUSD` on any record that carries an explicit `currencyCode`.
 */
export function formatMoney(
  value: number | string,
  currencyCode: string | null | undefined,
  opts: { paren?: boolean } = {},
): string {
  const code = (currencyCode ?? "").trim() || "USD";
  return `${code} ${formatAmount(value, opts)}`;
}

export function sumDebits(lines: Array<{ debit: string }>): number {
  return lines.reduce((s, l) => s + parseAmount(l.debit), 0);
}

export function sumCredits(lines: Array<{ credit: string }>): number {
  return lines.reduce((s, l) => s + parseAmount(l.credit), 0);
}

export function toDecimalString(n: number): string {
  return n.toFixed(2);
}

/**
 * Display helper for money <input> fields — formats a raw, possibly
 * partial user-typed string ("1234.5", "-1000") into the same value with
 * thousands separators ("1,234.5", "-1,000"). Preserves trailing dots and
 * partial decimals so the user can keep typing.
 */
export function formatMoneyInput(value: string): string {
  let cleaned = value.replace(/[^\d.-]/g, "");
  const negative = cleaned.startsWith("-");
  cleaned = cleaned.replace(/-/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  if (!cleaned) return negative ? "-" : "";
  const [intPart, decPart] = cleaned.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = decPart !== undefined ? `${grouped}.${decPart}` : grouped;
  return negative ? `-${out}` : out;
}
