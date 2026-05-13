/**
 * Minimal shimmer block used to pre-fill content while a server page
 * awaits its data. We don't pull in a CSS animation library — a small
 * `@keyframes` rule in globals.css drives the shimmer.
 */
export function Skeleton({
  w,
  h = 12,
  rounded = 4,
  className,
  style,
}: {
  /** Width in CSS units (e.g. "60%", 120, "10rem"). Defaults to 100%. */
  w?: string | number;
  /** Height in px. Defaults to 12. */
  h?: number;
  /** Border radius in px. Defaults to 4. */
  rounded?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`tw-skeleton ${className ?? ""}`}
      style={{
        display: "inline-block",
        width: typeof w === "number" ? `${w}px` : (w ?? "100%"),
        height: h,
        borderRadius: rounded,
        background: "var(--rail)",
        ...style,
      }}
    />
  );
}

/** Skeleton for a typical KPI tile in the dashboard. */
export function SkeletonTile() {
  return (
    <div
      className="rounded-lg p-3.5"
      style={{
        border: "1px solid var(--line)",
        background: "var(--raised)",
      }}
    >
      <Skeleton w={90} h={10} />
      <div style={{ marginTop: 8 }}>
        <Skeleton w={140} h={20} />
      </div>
      <div style={{ marginTop: 8 }}>
        <Skeleton w={110} h={10} />
      </div>
    </div>
  );
}

/** Skeleton for a single row in a table. */
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--line)" }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <Skeleton w={i === 0 ? 80 : i === cols - 1 ? 64 : "60%"} h={10} />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton for a Card that contains a table. */
export function SkeletonTableCard({
  title,
  cols = 4,
  rows = 6,
}: {
  title?: string;
  cols?: number;
  rows?: number;
}) {
  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-3.5 py-2"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <h3 className="text-[12.5px] font-semibold tracking-tight m-0">
          {title ?? <Skeleton w={120} h={12} />}
        </h3>
        <Skeleton w={72} h={10} />
      </div>
      <table className="w-full border-collapse" style={{ fontSize: 12 }}>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Skeleton for the standard PageHeader (title + meta + action chip). */
export function SkeletonPageHeader() {
  return (
    <div className="px-6 pt-4 pb-3">
      <div className="flex items-end justify-between gap-6">
        <div className="flex items-baseline gap-3.5 flex-wrap">
          <Skeleton w={180} h={22} />
          <Skeleton w={140} h={11} />
        </div>
        <div className="flex gap-1.5">
          <Skeleton w={90} h={28} rounded={6} />
        </div>
      </div>
    </div>
  );
}
