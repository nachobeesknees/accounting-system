"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard-widgets";
import { saveDashboardPrefsAction } from "@/app/(app)/dashboard-actions";

/**
 * "Customize" control for the dashboard — a popover listing every widget
 * with a visibility checkbox. Saves per-user via a server action.
 */
export function DashboardCustomize({ hidden }: { hidden: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hiddenSet = new Set(hidden);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Customize
      </Button>
      {open && (
        <div
          className="absolute right-0 mt-1.5 rounded-lg p-3.5 z-50"
          style={{
            background: "var(--raised)",
            border: "1px solid var(--line-2)",
            width: 340,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <form action={saveDashboardPrefsAction} className="flex flex-col gap-2">
            <div
              className="text-[10.5px] uppercase font-medium"
              style={{ color: "var(--ink-3)", letterSpacing: "0.04em" }}
            >
              Dashboard widgets
            </div>
            {DASHBOARD_WIDGETS.map((w) => (
              <label
                key={w.key}
                className="flex items-center gap-2 text-[12.5px] cursor-pointer"
                style={{ color: "var(--ink-2)" }}
              >
                <input
                  type="checkbox"
                  name="visible"
                  value={w.key}
                  defaultChecked={!hiddenSet.has(w.key)}
                />
                {w.label}
              </label>
            ))}
            <div className="flex justify-end gap-2 mt-1.5">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
