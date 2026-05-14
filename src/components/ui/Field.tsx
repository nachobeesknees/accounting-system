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

function HelpText({ children }: { children: ReactNode }) {
  return (
    <span
      className="text-[11px]"
      style={{ color: "var(--ink-4)", lineHeight: 1.4 }}
    >
      {children}
    </span>
  );
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: ReactNode;
  required?: boolean;
  mono?: boolean;
  /** One-line help text rendered under the input. */
  help?: ReactNode;
};

export function Field({ label, required, mono, help, className, ...rest }: FieldProps) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label && (
        <span className={labelClasses} style={labelStyle}>
          {label}
          {required && <span style={{ color: "var(--p-review-fg)" }}> *</span>}
        </span>
      )}
      <input className={inputClasses} style={inputStyle(mono)} required={required} {...rest} />
      {help && <HelpText>{help}</HelpText>}
    </label>
  );
}

export function SelectField({
  label,
  required,
  children,
  className,
  help,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; required?: boolean; help?: ReactNode }) {
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
      {help && <HelpText>{help}</HelpText>}
    </label>
  );
}

export function TextareaField({
  label,
  required,
  className,
  help,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; required?: boolean; help?: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label && (
        <span className={labelClasses} style={labelStyle}>
          {label}
          {required && <span style={{ color: "var(--p-review-fg)" }}> *</span>}
        </span>
      )}
      <textarea className={inputClasses} style={inputStyle(false)} required={required} rows={3} {...rest} />
      {help && <HelpText>{help}</HelpText>}
    </label>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 grid-cols-1 md:grid-cols-2">{children}</div>;
}
