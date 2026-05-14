/**
 * Vendor invoice numbering helpers — shared between client (form
 * suggestion) and server (duplicate check, last-used persistence).
 *
 * A vendor's numbering rule has three nullable fields:
 *   - invoiceNumberPrefix  — informational ("INV-")
 *   - invoiceNumberPattern — template, e.g. "INV-YYYY-####"
 *   - invoiceNumberLastUsed — the last value we recorded, used as the
 *     primary signal for the next suggestion (trailing-digit increment).
 *
 * Pattern placeholders:
 *   YYYY → 4-digit year      (today)
 *   YY   → 2-digit year
 *   MM   → 2-digit month
 *   DD   → 2-digit day
 *   #### → sequential number, zero-padded to placeholder width (1 → "0001")
 */

type Pick = {
  invoiceNumberPrefix: string | null;
  invoiceNumberPattern: string | null;
  invoiceNumberLastUsed: string | null;
};

function pad(n: number, w: number): string {
  return n.toString().padStart(w, "0");
}

function expandDatePlaceholders(template: string, when: Date): string {
  const yyyy = when.getUTCFullYear().toString();
  const yy = yyyy.slice(-2);
  const mm = pad(when.getUTCMonth() + 1, 2);
  const dd = pad(when.getUTCDate(), 2);
  return template
    .replace(/YYYY/g, yyyy)
    .replace(/YY/g, yy)
    .replace(/MM/g, mm)
    .replace(/DD/g, dd);
}

/**
 * Increment the trailing digit run of `s` and return the new string with
 * width preserved. Returns null when `s` has no trailing digits.
 */
function incrementTrailingDigits(s: string): string | null {
  const m = s.match(/(\d+)(\D*)$/);
  if (!m) return null;
  const num = m[1];
  const suffix = m[2];
  const next = (parseInt(num, 10) + 1).toString().padStart(num.length, "0");
  return s.slice(0, m.index!) + next + suffix;
}

/**
 * Build the next-suggested vendor invoice number for a vendor. Returns
 * null when neither the last-used value nor a pattern is configured.
 *
 * Order of precedence:
 *   1. invoiceNumberLastUsed → increment trailing digits.
 *   2. invoiceNumberPattern  → expand date placeholders, then expand
 *      "####" (any width ≥ 1) to "0001".
 *   3. null
 */
export function suggestNextVendorInvoiceNumber(
  vendor: Pick,
  now: Date = new Date(),
): string | null {
  if (vendor.invoiceNumberLastUsed) {
    const next = incrementTrailingDigits(vendor.invoiceNumberLastUsed);
    if (next) return next;
  }
  const pattern = vendor.invoiceNumberPattern;
  if (pattern && pattern.trim() !== "") {
    const dated = expandDatePlaceholders(pattern, now);
    // Replace the (first) run of '#' with a zero-padded "1".
    const hashed = dated.replace(/#+/, (run) => pad(1, run.length));
    return hashed;
  }
  return null;
}
