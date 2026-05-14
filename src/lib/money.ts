/**
 * Money helpers. The display side has one canonical formatter,
 * `formatMoney`, with optional compact and currency-suppression modes;
 * everything else (`formatUSD`, ad-hoc `formatAmount` + string concat)
 * funnels through it.
 *
 * Storage values are strings (numeric(15,2)) so we parse to floats with
 * care for arithmetic. For demo-scale figures float is fine; a Decimal
 * library would be needed once we touch trading or banking-grade precision.
 */

export function parseAmount(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function toDecimalString(n: number): string {
  return n.toFixed(2);
}

export function sumDebits(lines: Array<{ debit: string }>): number {
  return lines.reduce((s, l) => s + parseAmount(l.debit), 0);
}

export function sumCredits(lines: Array<{ credit: string }>): number {
  return lines.reduce((s, l) => s + parseAmount(l.credit), 0);
}

// ---------- Display ----------

export type MoneyFormatOpts = {
  /** Render negatives as `(123.45)` instead of `-123.45`. */
  paren?: boolean;
  /**
   * Compact mode rules:
   *   - |value| ≥ 1,000 → no cents       e.g. `83,250`
   *   - |value| <  1,000 → with cents    e.g. `450.75`
   *   - never trailing `.00`
   * Use on summary screens (dashboard, invoices/bills lists, BS, IS, AUA).
   */
  compact?: boolean;
  /**
   * Don't prepend the currency code. Use this when the column header or
   * surrounding row already conveys the currency (table-wide dedup).
   */
  hideCurrency?: boolean;
};

/**
 * Render `123.45` (or `-123.45` / `(123.45)`) without a currency code.
 * Used by `formatMoney` and a few specialty call sites that build their
 * own prefix.
 */
export function formatAmount(value: number | string, opts: MoneyFormatOpts = {}): string {
  const n = typeof value === "string" ? parseAmount(value) : value;
  const abs = Math.abs(n);

  let formatted: string;
  if (opts.compact) {
    const fractionDigits = abs >= 1000 ? 0 : 2;
    formatted = abs.toLocaleString("en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    // Strip a trailing `.00` even when min/maxFractionDigits agreed on 2
    // — happens for amounts like 450.00 that fall under the 1k threshold
    // but happen to be whole dollars.
    formatted = formatted.replace(/\.00$/, "");
  } else {
    formatted = abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (n < 0) return opts.paren ? `(${formatted})` : `-${formatted}`;
  return formatted;
}

/**
 * Currency-aware money formatter. Single source of truth for any "money
 * value with optional currency code" in the UI.
 *
 * Examples:
 *   formatMoney(1234.56)                            → "USD 1,234.56"
 *   formatMoney(1234.56, "EUR")                     → "EUR 1,234.56"
 *   formatMoney(83250, "USD", { compact: true })    → "USD 83,250"
 *   formatMoney(450.75, "USD", { compact: true })   → "USD 450.75"
 *   formatMoney(-100, "USD", { paren: true })       → "USD (100.00)"
 *   formatMoney(100, "USD", { hideCurrency: true }) → "100.00"
 */
export function formatMoney(
  value: number | string,
  currencyCode?: string | null,
  opts: MoneyFormatOpts = {},
): string {
  const code = (currencyCode ?? "").trim() || "USD";
  const body = formatAmount(value, opts);
  return opts.hideCurrency ? body : `${code} ${body}`;
}

/**
 * Legacy convenience: `formatUSD(x)` → `formatMoney(x, "USD")`. Kept for
 * call sites that haven't been migrated. New code should use
 * `formatMoney(value, currencyCode)` so foreign-currency records render
 * correctly without further plumbing.
 */
export function formatUSD(value: number | string, opts: MoneyFormatOpts = {}): string {
  return formatMoney(value, "USD", opts);
}

// ---------- Currency-deduplication helpers ----------

/**
 * Returns the shared currency code across a list of records, or `null` if
 * the list is empty or mixed-currency. Used to decide whether a table can
 * lift its currency code into the header (single code) or must keep it
 * inline on each row (mixed). Records without a currency field count as
 * unset and don't poison the result.
 */
export function dominantCurrency<T extends { currencyCode?: string | null }>(
  items: T[],
  fallback: string | null = null,
): string | null {
  let seen: string | null = null;
  for (const it of items) {
    const c = (it.currencyCode ?? "").trim();
    if (!c) continue;
    if (seen == null) {
      seen = c;
    } else if (seen !== c) {
      return null; // mixed — caller must render per-row
    }
  }
  return seen ?? fallback;
}

// ---------- MoneyInput helpers ----------

/**
 * Display helper for money <input> fields — formats a raw, possibly
 * partial user-typed string into the same value with thousands separators.
 * Preserves trailing dots and partial decimals so the user can keep typing.
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
