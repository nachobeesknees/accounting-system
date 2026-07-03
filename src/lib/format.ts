/**
 * Small display helpers shared across server components.
 */

/**
 * Mask a bank account number for display: everything but the last four
 * digits becomes dots ("····1234"). Falls back to the stored last-four
 * when the full number isn't on file; "—" when neither is.
 */
export function maskAccountNumber(
  accountNumber: string | null | undefined,
  lastFour?: string | null,
): string {
  const digits = (accountNumber ?? "").replace(/[^0-9A-Za-z]/g, "");
  if (digits.length >= 4) return `····${digits.slice(-4)}`;
  if (lastFour) return `····${lastFour}`;
  return "—";
}

/**
 * Format an ISO date string (YYYY-MM-DD) as "MMM d, Y" in UTC so the
 * rendered date matches the stored business date regardless of locale.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
