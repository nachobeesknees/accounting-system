"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SmartSelect } from "@/components/ui/SmartSelect";

type EntityOption = { id: string; code: string; name: string };

export function EntityScopePicker({
  entities,
  current,
  onChange,
}: {
  entities: EntityOption[];
  current: string | null;
  onChange: (entityId: string | null) => Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const value = current ?? "all";

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md"
      style={{
        background: current ? "var(--p-formation-bg)" : "transparent",
        color: current ? "var(--p-formation-fg)" : "var(--ink-3)",
        border: "1px solid " + (current ? "transparent" : "var(--line)"),
        fontSize: 12,
        opacity: isPending ? 0.6 : 1,
      }}
      title="Filter the books to a single entity, or show All entities"
    >
      <span
        style={{
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          opacity: 0.8,
        }}
      >
        Entity
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
          ...entities.map((e) => ({
            value: e.id,
            label: `${e.code} — ${e.name}`,
            search: e.code,
          })),
        ]}
        triggerStyle={{
          background: "transparent",
          border: "none",
          color: "inherit",
          fontFamily: current ? "var(--font-mono)" : "inherit",
          fontVariantNumeric: "tabular-nums",
          fontSize: 12.5,
          fontWeight: current ? 600 : 400,
          padding: "0 18px 0 0",
          minHeight: 22,
          minWidth: 120,
        }}
      />
    </div>
  );
}
