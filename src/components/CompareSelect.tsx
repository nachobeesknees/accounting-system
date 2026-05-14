"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SmartSelect } from "@/components/ui/SmartSelect";
import {
  COMPARE_OPTIONS,
  parseCompare,
  type CompareMode,
} from "@/lib/report-periods";

const TRIGGER_STYLE: React.CSSProperties = {
  background: "var(--raised)",
  color: "var(--ink)",
  border: "1px solid var(--line-2)",
  borderRadius: 6,
  padding: "4px 28px 4px 8px",
  fontSize: 12.5,
  minHeight: 28,
  minWidth: 140,
};

/**
 * "Compare to…" dropdown. Some options are only meaningful on certain
 * reports (e.g. Budget only applies to the income statement) — pass
 * `allowedModes` to narrow the menu when rendering.
 */
export function CompareSelect({
  allowedModes,
}: {
  allowedModes?: CompareMode[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = parseCompare(params.get("compare"));
  const options = allowedModes
    ? COMPARE_OPTIONS.filter((o) => allowedModes.includes(o.value))
    : COMPARE_OPTIONS;

  function setCompare(next: string) {
    const ps = new URLSearchParams(params.toString());
    if (next === "none") ps.delete("compare");
    else ps.set("compare", next);
    startTransition(() => {
      router.replace(`?${ps.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className="flex items-center gap-2"
      style={{ opacity: pending ? 0.7 : 1 }}
    >
      <label
        className="text-[11.5px] uppercase tracking-wider"
        style={{ color: "var(--ink-3)" }}
      >
        Compare
      </label>
      <SmartSelect
        value={current}
        onChange={setCompare}
        ariaLabel="Compare to"
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        triggerStyle={TRIGGER_STYLE}
      />
    </div>
  );
}
