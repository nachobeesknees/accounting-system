import type { CSSProperties } from "react";

export function Skeleton({
  w,
  h = 12,
  className,
  style,
  rounded = true,
}: {
  w?: number | string;
  h?: number | string;
  className?: string;
  style?: CSSProperties;
  rounded?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`skeleton-pulse inline-block ${className ?? ""}`}
      style={{
        width: w,
        height: h,
        background: "var(--rail)",
        borderRadius: rounded ? 4 : 0,
        ...style,
      }}
    />
  );
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div
      className="flex items-center gap-4 px-3 py-2"
      style={{ borderBottom: "1px solid var(--line)" }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          h={11}
          w={i === 0 ? "12%" : i === 1 ? "20%" : i === cols - 1 ? "10%" : "18%"}
        />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
    >
      <div
        className="px-3 py-2 flex gap-4"
        style={{ background: "var(--rail)", borderBottom: "1px solid var(--line)" }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} h={10} w={i === cols - 1 ? "10%" : "16%"} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg p-3.5 flex flex-col gap-2"
          style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
        >
          <Skeleton h={9} w="40%" />
          <Skeleton h={22} w="60%" />
          <Skeleton h={9} w="50%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonHeader() {
  return (
    <div className="px-6 pt-4 pb-3 flex items-end justify-between gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton h={18} w={180} />
        <Skeleton h={11} w={120} />
      </div>
      <Skeleton h={26} w={110} />
    </div>
  );
}
