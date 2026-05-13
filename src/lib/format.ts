/**
 * Small display helpers shared across server components.
 */

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
