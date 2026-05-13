import type { ReactNode } from "react";

type Tone = "success" | "info" | "warning" | "error";

const TONE_STYLES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: "var(--p-active-bg)", fg: "var(--p-active-fg)" },
  info: { bg: "var(--p-formation-bg)", fg: "var(--p-formation-fg)" },
  warning: { bg: "var(--p-pending-bg)", fg: "var(--p-pending-fg)" },
  error: { bg: "var(--p-review-bg)", fg: "var(--p-review-fg)" },
};

export function Banner({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md px-3 py-2 text-[12.5px] ${className ?? ""}`}
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.fg}` }}
    >
      {children}
    </div>
  );
}
