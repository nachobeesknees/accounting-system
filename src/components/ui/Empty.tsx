import type { ReactNode } from "react";

export function Empty({
  title,
  body,
  cta,
  icon,
}: {
  title: ReactNode;
  body?: ReactNode;
  cta?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="py-12 px-6 text-center">
      {icon && (
        <div
          className="w-10 h-10 mx-auto mb-3 rounded-full flex items-center justify-center"
          style={{ background: "var(--rail)", color: "var(--ink-3)" }}
        >
          {icon}
        </div>
      )}
      <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </div>
      {body && (
        <div className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          {body}
        </div>
      )}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
