import type { ReactNode } from "react";

export type PillVariant = "active" | "pending" | "formation" | "review" | "neutral";

const TOKEN: Record<PillVariant, { bg: string; fg: string }> = {
  active:    { bg: "var(--p-active-bg)",    fg: "var(--p-active-fg)" },
  pending:   { bg: "var(--p-pending-bg)",   fg: "var(--p-pending-fg)" },
  formation: { bg: "var(--p-formation-bg)", fg: "var(--p-formation-fg)" },
  review:    { bg: "var(--p-review-bg)",    fg: "var(--p-review-fg)" },
  neutral:   { bg: "var(--p-neutral-bg)",   fg: "var(--p-neutral-fg)" },
};

export function Pill({ variant, children }: { variant: PillVariant; children: ReactNode }) {
  const { bg, fg } = TOKEN[variant];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11.5px] font-medium"
      style={{ background: bg, color: fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: fg }} />
      {children}
    </span>
  );
}

export function statusVariant(status: string | null | undefined): PillVariant {
  switch ((status || "").toLowerCase()) {
    case "posted":
    case "paid":
    case "reconciled":
    case "open":
    case "active":
      return "active";
    case "draft":
    case "pending":
    case "partial":
    case "closing":
      return "pending";
    case "sent":
    case "approved":
      return "formation";
    case "void":
    case "overdue":
      return "review";
    case "closed":
    case "inactive":
      return "neutral";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return status
    .replace(/_/g, " ")
    .split(" ")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
