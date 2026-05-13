import type { ReactNode } from "react";

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="px-6 pt-4 pb-3">
      <div className="flex items-end justify-between gap-6">
        <div className="flex items-baseline gap-3.5 flex-wrap">
          <h1
            className="text-[20px] font-semibold tracking-tight m-0"
            style={{ letterSpacing: "-0.01em", color: "var(--ink)" }}
          >
            {title}
          </h1>
          {meta && (
            <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              {meta}
            </span>
          )}
        </div>
        {actions && <div className="flex gap-1.5">{actions}</div>}
      </div>
    </div>
  );
}
