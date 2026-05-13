"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, MouseEvent } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse" style={{ fontSize: 12 }}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

/**
 * Row. When `href` is set the entire row becomes a navigation target —
 * clicking anywhere navigates, but clicks on nested <a>/<button>/<input>
 * still take precedence (so action links inside cells keep working).
 */
export function TR({
  children,
  hover = true,
  total = false,
  href,
}: {
  children: ReactNode;
  hover?: boolean;
  total?: boolean;
  href?: string;
}) {
  const router = useRouter();

  const onClick = href
    ? (e: MouseEvent<HTMLTableRowElement>) => {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        // Don't hijack clicks on nested interactive elements.
        if (t.closest("a, button, input, select, textarea, label")) return;
        // Cmd/Ctrl/Shift/middle-click → new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
          if (e.button === 0 && (e.metaKey || e.ctrlKey)) {
            window.open(href, "_blank");
            e.preventDefault();
            return;
          }
          return;
        }
        router.push(href);
      }
    : undefined;

  const baseHover = hover ? "hover:bg-[var(--hover)]" : "";
  const clickable = href ? "cursor-pointer" : "";
  return (
    <tr
      className={`${baseHover} ${clickable}`.trim()}
      style={total ? { background: "var(--rail)", fontWeight: 600 } : undefined}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TH({
  num,
  children,
  style,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return (
    <th
      {...rest}
      className={`px-3 py-1 text-left font-medium uppercase ${num ? "text-right" : ""}`}
      style={{
        fontSize: 10.5,
        letterSpacing: "0.04em",
        color: "var(--ink-3)",
        background: "var(--rail)",
        borderBottom: "1px solid var(--line)",
        position: "sticky",
        top: 0,
        zIndex: 1,
        whiteSpace: "nowrap",
        fontFamily: num ? "var(--font-mono)" : undefined,
        ...style,
      }}
    >
      {children}
    </th>
  );
}

export function TD({
  num,
  mono,
  neg,
  wrap,
  children,
  style,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & {
  num?: boolean;
  mono?: boolean;
  neg?: boolean;
  /** Opt into wrapping for long-form / description columns. Default off so
   *  rows stay compact and never balloon to two lines. */
  wrap?: boolean;
}) {
  const useMono = num || mono;
  return (
    <td
      {...rest}
      className={`px-3 py-1 ${num ? "text-right" : ""}`}
      style={{
        borderBottom: "1px solid var(--line)",
        color: neg ? "var(--p-review-fg)" : "var(--ink-2)",
        fontFamily: useMono ? "var(--font-mono)" : undefined,
        fontVariantNumeric: useMono ? "tabular-nums" : undefined,
        whiteSpace: wrap ? "normal" : "nowrap",
        overflow: wrap ? undefined : "hidden",
        textOverflow: wrap ? undefined : "ellipsis",
        maxWidth: wrap ? undefined : 360,
        ...style,
      }}
    >
      {children}
    </td>
  );
}
