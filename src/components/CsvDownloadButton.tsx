"use client";

import { ButtonLink } from "@/components/ui/Button";
import { useSearchParams } from "next/navigation";

/**
 * Link that triggers a CSV download from a route handler. Forwards the
 * current page's search params so the export matches what the user is
 * looking at (period, compare, year, etc.).
 */
export function CsvDownloadButton({
  report,
  label = "Export CSV",
  extraParams,
}: {
  report: "trial-balance" | "balance-sheet" | "income-statement" | "income-statement-monthly";
  label?: string;
  extraParams?: Record<string, string>;
}) {
  const params = useSearchParams();
  const next = new URLSearchParams(params.toString());
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) next.set(k, v);
  }
  const qs = next.toString();
  const href = `/api/reports/${report}/csv${qs ? `?${qs}` : ""}`;
  return (
    <ButtonLink href={href} variant="secondary">
      {label}
    </ButtonLink>
  );
}
