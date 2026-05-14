"use client";

import { Button } from "@/components/ui/Button";

/**
 * Trigger `window.print()`. Sidebar/topbar are hidden via the
 * `@media print` block in globals.css.
 */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button
      variant="secondary"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
    >
      {label}
    </Button>
  );
}
