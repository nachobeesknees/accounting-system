"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SmartSelect } from "@/components/ui/SmartSelect";

export function YearPicker({ current }: { current: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const years = [current + 1, current, current - 1, current - 2, current - 3];

  return (
    <div
      className="flex items-center gap-1.5"
      style={{ opacity: pending ? 0.7 : 1 }}
    >
      <label
        className="text-[11.5px] uppercase tracking-wider"
        style={{ color: "var(--ink-3)" }}
      >
        Year
      </label>
      <SmartSelect
        value={String(current)}
        onChange={(v) => {
          const ps = new URLSearchParams(params.toString());
          ps.set("tab", "monthly");
          ps.set("year", v);
          startTransition(() => router.replace(`?${ps.toString()}`, { scroll: false }));
        }}
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
        ariaLabel="Year"
        triggerStyle={{
          background: "var(--raised)",
          border: "1px solid var(--line-2)",
          borderRadius: 6,
          padding: "4px 28px 4px 8px",
          fontSize: 12.5,
          minHeight: 28,
          minWidth: 90,
        }}
      />
    </div>
  );
}
