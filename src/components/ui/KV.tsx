import type { ReactNode } from "react";

/**
 * Stack KV rows vertically. Earlier this used a 2-column layout on md+,
 * but that gave each value cell so little width that nowrap content
 * (account codes, phone numbers, amounts) bled into the next column.
 * Cards already sit side-by-side, so stacking inside each is plenty
 * dense while letting each value claim the full card width.
 */
export function KVGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1">{children}</div>;
}

export function KV({
  k,
  v,
  sub,
  mono,
}: {
  k: ReactNode;
  v: ReactNode;
  sub?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      className="grid gap-2 px-3.5 py-1.5"
      style={{
        gridTemplateColumns: "120px 1fr",
        borderBottom: "1px dashed var(--line)",
      }}
    >
      <div className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {k}
      </div>
      <div
        className="text-[12.5px]"
        style={{
          color: "var(--ink)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
          fontVariantNumeric: mono ? "tabular-nums" : undefined,
          whiteSpace: "nowrap",
        }}
        title={typeof v === "string" ? v : undefined}
      >
        {v}
        {sub && (
          <div
            className="text-[11px] mt-0.5"
            style={{
              color: "var(--ink-4)",
              fontFamily: "var(--font-sans)",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
