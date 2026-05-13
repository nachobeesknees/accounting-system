import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<Variant, string> = {
  primary: "",
  secondary: "",
  ghost: "",
  danger: "",
};

function styleFor(variant: Variant) {
  switch (variant) {
    case "primary":
      return {
        background: "var(--accent)",
        color: "var(--accent-fg)",
        border: "1px solid var(--accent)",
      };
    case "secondary":
      return {
        background: "var(--raised)",
        color: "var(--ink)",
        border: "1px solid var(--line-2)",
      };
    case "ghost":
      return { background: "transparent", color: "var(--ink-3)", border: "1px solid transparent" };
    case "danger":
      return { background: "transparent", color: "var(--p-review-fg)", border: "1px solid transparent" };
  }
}

const BASE_CLASSES = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium cursor-pointer transition-colors no-underline";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }
>(function Button({ variant = "secondary", children, ...props }, ref) {
  return (
    <button
      ref={ref}
      {...props}
      className={`${BASE_CLASSES} ${variantClasses[variant]} ${props.className ?? ""}`}
      style={{ ...styleFor(variant), ...(props.style ?? {}) }}
    >
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = "secondary",
  children,
  href,
  className,
}: {
  variant?: Variant;
  children: ReactNode;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${BASE_CLASSES} ${variantClasses[variant]} ${className ?? ""}`}
      style={styleFor(variant)}
    >
      {children}
    </Link>
  );
}
