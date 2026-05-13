import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const labelClasses = "text-[11.5px]";
const labelStyle = { color: "var(--ink-3)" } as const;
const inputClasses = "px-2.5 py-1.5 text-[13px] rounded-md outline-none";

function inputStyle(mono?: boolean, money?: boolean) {
  return {
    background: "var(--paper)",
    border: "1px solid var(--line-2)",
    color: "var(--ink)",
    fontFamily: mono || money ? "var(--font-mono)" : undefined,
    fontVariantNumeric: mono || money ? "tabular-nums" : undefined,
    textAlign: money ? ("right" as const) : undefined,
  };
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: ReactNode;
  required?: boolean;
  mono?: boolean;
  /** Money fields: mono font, right-aligned, "$" hint. */
  money?: boolean;
  /** Optional hint shown below the input (e.g. "Net 30", "USD"). */
  hint?: ReactNode;
  /** Error message rendered below the input (sets aria-invalid). */
  error?: ReactNode;
};

export function Field({ label, required, mono, money, hint, error, className, ...rest }: FieldProps) {
  const hasError = !!error;
  const inputEl = (
    <input
      className={inputClasses}
      style={inputStyle(mono, money)}
      required={required}
      aria-invalid={hasError || undefined}
      {...rest}
    />
  );
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label && (
        <span className={labelClasses} style={labelStyle}>
          {label}
          {required && <span style={{ color: "var(--p-review-fg)" }}> *</span>}
        </span>
      )}
      {money ? (
        <span className="relative inline-flex items-center">
          <span
            aria-hidden
            className="absolute left-2 text-[12px] pointer-events-none"
            style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}
          >
            $
          </span>
          <input
            className={inputClasses + " w-full"}
            style={{ ...inputStyle(mono, money), paddingLeft: 20 }}
            required={required}
            aria-invalid={hasError || undefined}
            {...rest}
          />
        </span>
      ) : (
        inputEl
      )}
      {hint && !hasError && (
        <span className="text-[11px]" style={{ color: "var(--ink-4)" }}>
          {hint}
        </span>
      )}
      {hasError && (
        <span className="text-[11px]" style={{ color: "var(--p-review-fg)" }}>
          {error}
        </span>
      )}
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
