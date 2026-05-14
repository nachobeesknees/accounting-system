import Link from "next/link";

import { formatAmount, formatMoney } from "@/lib/money";

/**
 * Every money figure in the app should be drillable — clicking a balance
 * should open the underlying records that produced it. `DrillNumber` is
 * the single tap point for that. Wrap any rendered amount with this so
 * we get a consistent style + behavior:
 *
 *   <DrillNumber value={inv.balanceDue} href={`/invoices/${inv.id}`} />
 *
 * If `href` is omitted the value renders as plain text — useful for
 * subtotals where there isn't a meaningful drill target. The visual
 * affordance is the dotted-underline + hover color; we deliberately
 * avoid full underline so dense reports stay quiet until the user mouses
 * over a row.
 */
export function DrillNumber({
  value,
  href,
  currencyCode,
  paren = true,
  compact = false,
  mono = true,
  neg,
  title,
  className,
  style,
  ariaLabel,
}: {
  value: number | string;
  href?: string;
  /**
   * Currency to render alongside the number:
   *   - `string` (e.g. `"USD"`) → `USD 1,234.56`
   *   - `null` → plain `1,234.56` (no currency; caller is responsible for
   *     showing it elsewhere, e.g. in the column header)
   *   - `undefined` → plain `1,234.56` (numeric-only)
   */
  currencyCode?: string | null;
  /** Render negatives in parens. Defaults to true (accounting convention). */
  paren?: boolean;
  /** Drop cents for amounts ≥ $1,000 and strip trailing `.00` for amounts < $1,000. */
  compact?: boolean;
  mono?: boolean;
  /** Force red color (overrides automatic negative coloring). */
  neg?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  const n = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  const isNegative = neg ?? (Number.isFinite(n) && n < 0);
  const text =
    currencyCode == null
      ? formatAmount(value, { paren, compact })
      : formatMoney(value, currencyCode, { paren, compact });

  const numberStyle: React.CSSProperties = {
    fontVariantNumeric: "tabular-nums",
    fontFamily: mono
      ? "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
      : undefined,
    color: isNegative ? "var(--danger, #b42318)" : undefined,
    ...style,
  };

  if (!href) {
    return (
      <span
        className={className}
        style={numberStyle}
        title={title}
        aria-label={ariaLabel}
      >
        {text}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`drill-number ${className ?? ""}`.trim()}
      style={numberStyle}
      title={title ?? "Drill into details"}
      aria-label={ariaLabel}
    >
      {text}
    </Link>
  );
}

/**
 * Build a `/journal?account=<id>` href that the journal page can use to
 * pre-filter its list. Used by Trial Balance and Balance Sheet rows so
 * clicking a balance opens "every JE that posted to this account".
 *
 *   <DrillNumber value={bal} href={drillToAccount(a.id)} />
 */
export function drillToAccount(accountId: string, opts?: {
  start?: string;
  end?: string;
  scope?: string | null;
}): string {
  const qs = new URLSearchParams();
  qs.set("account", accountId);
  if (opts?.start) qs.set("from", opts.start);
  if (opts?.end) qs.set("to", opts.end);
  if (opts?.scope) qs.set("firm", opts.scope);
  return `/journal?${qs.toString()}`;
}
