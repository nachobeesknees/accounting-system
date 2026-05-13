import type { ReactNode } from "react";

export function Card({
  title,
  actions,
  children,
  bodyPadding = false,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyPadding?: boolean;
}) {
  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
    >
      {(title || actions) && (
        <div
          className="flex items-center justify-between gap-3 px-3.5 py-2"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <h3 className="text-[12.5px] font-semibold tracking-tight m-0">{title}</h3>
          {actions && (
            <div className="flex gap-3 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              {actions}
            </div>
          )}
        </div>
      )}
      <div className={bodyPadding ? "p-3.5" : ""}>{children}</div>
    </section>
  );
}

export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--line)", background: "var(--raised)" }}
    >
      <div
        className="px-3.5 py-2 text-[12.5px] font-semibold"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        {title}
      </div>
      <div className="p-3.5 flex flex-col gap-2.5">{children}</div>
    </section>
  );
}
