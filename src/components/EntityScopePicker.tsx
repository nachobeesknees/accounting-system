"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SmartSelect } from "@/components/ui/SmartSelect";

type EntityOption = {
  id: string;
  code: string;
  name: string;
  regionId?: string | null;
};
type RegionOption = { id: string; name: string };

const REGION_PREFIX = "region:";

export function EntityScopePicker({
  entities,
  regions,
  current,
  onChange,
}: {
  entities: EntityOption[];
  regions: RegionOption[];
  current: string | null;
  onChange: (entityId: string | null) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const value = current ?? "all";
  const isRegion = !!current && current.startsWith(REGION_PREFIX);
  const isOffice = !!current && !isRegion;

  // Only show regions that have ≥1 office attached. AppShell already
  // filters server-side, but recompute defensively in case the caller
  // passes everything.
  const officeCountByRegion = new Map<string, number>();
  for (const e of entities) {
    if (e.regionId) {
      officeCountByRegion.set(
        e.regionId,
        (officeCountByRegion.get(e.regionId) ?? 0) + 1,
      );
    }
  }
  // If the caller (AppShell) has already filtered to regions with ≥1
  // attached office (it does), trust that filter even when our local
  // entities[].regionId arrives stripped of nullable optionals via SSR
  // serialization. The previous defensive filter was emptying the list
  // in that case.
  const usableRegions =
    officeCountByRegion.size === 0
      ? regions
      : regions.filter((r) => (officeCountByRegion.get(r.id) ?? 0) > 0);

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md"
      style={{
        background:
          isOffice || isRegion ? "var(--p-formation-bg)" : "transparent",
        color: isOffice || isRegion ? "var(--p-formation-fg)" : "var(--ink-3)",
        border:
          "1px solid " +
          (isOffice || isRegion ? "transparent" : "var(--line)"),
        fontSize: 12,
        opacity: isPending ? 0.6 : 1,
      }}
      title="Filter the books to a single entity, an entire region, or All entities"
    >
      <span
        style={{
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          opacity: 0.8,
        }}
      >
        {isRegion ? "Region" : "Entity"}
      </span>
      <SmartSelect
        value={value}
        onChange={(v) => {
          const next = v === "all" ? null : v;
          startTransition(async () => {
            await onChange(next);
            router.refresh();
          });
        }}
        disabled={isPending}
        ariaLabel="Entity scope"
        options={[
          { value: "all", label: "All entities" },
          ...usableRegions.map((r) => ({
            value: `${REGION_PREFIX}${r.id}`,
            label: `${r.name} — all firm entities`,
            search: `${r.name} region`,
            group: "Regions",
          })),
          ...entities.map((e) => ({
            value: e.id,
            label: `${e.code} — ${e.name}`,
            search: e.code,
            group: "Firm entities",
          })),
        ]}
        triggerStyle={{
          background: "transparent",
          border: "none",
          color: "inherit",
          fontFamily: isOffice ? "var(--font-mono)" : "inherit",
          fontVariantNumeric: "tabular-nums",
          fontSize: 12.5,
          fontWeight: isOffice || isRegion ? 600 : 400,
          padding: "0 18px 0 0",
          minHeight: 22,
          minWidth: 120,
        }}
      />
    </div>
  );
}
