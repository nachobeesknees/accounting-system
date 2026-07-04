import { Tabs } from "@/components/ui/Tabs";

type CloseTabId = "checklist" | "year-end" | "fx-revaluation";

/** Shared sub-navigation across the close-chain pages. */
export function CloseTabs({ active }: { active: CloseTabId }) {
  return (
    <Tabs
      tabs={[
        { id: "checklist", label: "Month-End Checklist", href: "/close" },
        { id: "year-end", label: "Year-End Close", href: "/close/year-end" },
        {
          id: "fx-revaluation",
          label: "FX Revaluation",
          href: "/close/fx-revaluation",
        },
      ]}
      activeId={active}
    />
  );
}
