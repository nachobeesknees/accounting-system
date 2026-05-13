/**
 * Money helpers. All money values are strings (numeric(15,2)) so we do
 * arithmetic by parsing to floats with care, or stay in strings for
 * display. For real DB-backed work we'd use a Decimal library; for this
 * demo the values are bounded and 2dp so float works.
 */

export function parseAmount(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  const n = parseFloat(value);
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

export function sumDebits(lines: Array<{ debit: string }>): number {
  return lines.reduce((s, l) => s + parseAmount(l.debit), 0);
}

export function sumCredits(lines: Array<{ credit: string }>): number {
  return lines.reduce((s, l) => s + parseAmount(l.credit), 0);
}

export function toDecimalString(n: number): string {
  return n.toFixed(2);
}
