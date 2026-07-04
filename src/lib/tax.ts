/**
 * Pure VAT/GST helpers shared by the invoice/bill line editors, the posting
 * mutations, and the VAT return report. No DB access — callers pass in the
 * resolved tax code.
 */

import type { TaxCode, TaxCodeKind } from "./types";

/**
 * Line-level tax amount for a given base amount + tax code.
 *   - standard / reduced / zero_rated → round(amount × rate)
 *     (zero-rated rate is 0 → tax 0, but the line is still IN the VAT net)
 *   - exempt / out_of_scope → 0 (and NOT in the VAT net)
 *   - no code → 0
 */
export function lineTaxAmount(
  amount: number,
  code: Pick<TaxCode, "rate" | "kind"> | null | undefined,
): number {
  if (!code) return 0;
  switch (code.kind) {
    case "standard":
    case "reduced":
    case "zero_rated": {
      const rate = parseFloat(code.rate) || 0;
      return Math.round(amount * rate * 100) / 100;
    }
    case "exempt":
    case "out_of_scope":
    default:
      return 0;
  }
}

/** True when a tax code sits inside the VAT net (standard/reduced/zero-rated). */
export function isInVatNet(kind: TaxCodeKind): boolean {
  return kind === "standard" || kind === "reduced" || kind === "zero_rated";
}

/** Human label for a tax-code kind. */
export function taxKindLabel(kind: TaxCodeKind): string {
  switch (kind) {
    case "standard":
      return "Standard";
    case "reduced":
      return "Reduced";
    case "zero_rated":
      return "Zero-rated";
    case "exempt":
      return "Exempt";
    case "out_of_scope":
      return "Out of scope";
    default:
      return kind;
  }
}

export const TAX_CODE_KINDS: TaxCodeKind[] = [
  "standard",
  "reduced",
  "zero_rated",
  "exempt",
  "out_of_scope",
];
