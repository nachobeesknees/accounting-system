"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

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
  const activeEntity = current ? entities.find((e) => e.id === current) : undefined;

  return (
    <label
      className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer"
      style={{
        background: current ? "var(--p-formation-bg)" : "transparent",
        color: current ? "var(--p-formation-fg)" : "var(--ink-3)",
        border: "1px solid " + (current ? "transparent" : "var(--line)"),
        fontSize: 12,
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
      <select
        value={value}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value === "all" ? null : e.target.value;
          startTransition(async () => {
            await onChange(next);
            router.refresh();
          });
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          fontFamily: activeEntity ? "var(--font-mono)" : "inherit",
          fontVariantNumeric: "tabular-nums",
          fontSize: 12.5,
          fontWeight: current ? 600 : 400,
          outline: "none",
          cursor: "pointer",
        }}
      >
        <option value="all">All entities</option>
        {entities.map((e) => (
          <option key={e.id} value={e.id}>
            {e.code} — {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}
