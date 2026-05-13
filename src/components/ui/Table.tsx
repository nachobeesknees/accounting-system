import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

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

export function TR({ children, hover = true, total = false }: { children: ReactNode; hover?: boolean; total?: boolean }) {
  return (
    <tr
      className={`${hover ? "hover:bg-[var(--hover)]" : ""}`}
      style={total ? { background: "var(--rail)", fontWeight: 600 } : undefined}
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
  children,
  style,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean; mono?: boolean; neg?: boolean }) {
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
        ...style,
      }}
    >
      {children}
    </td>
  );
}
