"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SmartSelect } from "@/components/ui/SmartSelect";
import {
  PERIOD_PRESET_OPTIONS,
  parsePreset,
  type PeriodPreset,
} from "@/lib/report-periods";

const TRIGGER_STYLE: React.CSSProperties = {
  background: "var(--raised)",
  color: "var(--ink)",
  border: "1px solid var(--line-2)",
  borderRadius: 6,
  padding: "4px 28px 4px 8px",
  fontSize: 12.5,
  minHeight: 28,
  minWidth: 130,
};

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--raised)",
  color: "var(--ink)",
  border: "1px solid var(--line-2)",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 12.5,
  fontFamily: "var(--font-mono)",
};

/**
 * Period preset + custom-date picker. Writes its choice to the URL via
 * search params so the server component can react and so the link is
 * shareable. We use `replace` to avoid blowing up the history stack.
 */
export function PeriodPicker() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const preset = parsePreset(params.get("preset"));
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false });
    });
  }

  function setPreset(next: string) {
    const ps = new URLSearchParams(params.toString());
    ps.set("preset", next);
    if (next !== "custom") {
      ps.delete("from");
      ps.delete("to");
    }
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
        Period
      </label>
      <SmartSelect
        value={preset}
        onChange={(v) => setPreset(v as PeriodPreset)}
        ariaLabel="Period preset"
        options={PERIOD_PRESET_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        triggerStyle={TRIGGER_STYLE}
      />
      {preset === "custom" && (
        <>
          <input
            type="date"
            value={from}
            onChange={(e) => setParam("from", e.target.value)}
            style={INPUT_STYLE}
            aria-label="Start date"
          />
          <span style={{ color: "var(--ink-4)", fontSize: 12 }}>→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setParam("to", e.target.value)}
            style={INPUT_STYLE}
            aria-label="End date"
          />
        </>
      )}
    </div>
  );
}
