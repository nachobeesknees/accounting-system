import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const labelClasses = "text-[11.5px]";
const labelStyle = { color: "var(--ink-3)" } as const;
const inputClasses = "px-2.5 py-1.5 text-[13px] rounded-md outline-none";

function inputStyle(mono?: boolean) {
  return {
    background: "var(--paper)",
    border: "1px solid var(--line-2)",
    color: "var(--ink)",
    fontFamily: mono ? "var(--font-mono)" : undefined,
    fontVariantNumeric: mono ? "tabular-nums" : undefined,
  } as const;
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: ReactNode;
  required?: boolean;
  mono?: boolean;
};

export function Field({ label, required, mono, className, ...rest }: FieldProps) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label && (
        <span className={labelClasses} style={labelStyle}>
          {label}
          {required && <span style={{ color: "var(--p-review-fg)" }}> *</span>}
        </span>
      )}
      <input className={inputClasses} style={inputStyle(mono)} required={required} {...rest} />
    </label>
  );
}

export function SelectField({
  label,
  required,
  children,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; required?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label && (
        <span className={labelClasses} style={labelStyle}>
          {label}
          {required && <span style={{ color: "var(--p-review-fg)" }}> *</span>}
        </span>
      )}
      <select className={inputClasses} style={inputStyle(false)} required={required} {...rest}>
        {children}
      </select>
    </label>
  );
}

export function TextareaField({
  label,
  required,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; required?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label && (
        <span className={labelClasses} style={labelStyle}>
          {label}
          {required && <span style={{ color: "var(--p-review-fg)" }}> *</span>}
        </span>
      )}
      <textarea className={inputClasses} style={inputStyle(false)} required={required} rows={3} {...rest} />
    </label>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 grid-cols-1 md:grid-cols-2">{children}</div>;
}
