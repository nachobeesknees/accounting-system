"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/**
 * A submit button that opens a modal confirmation dialog before firing
 * its enclosing form. Drop it inside any `<form action={...}>` and it
 * behaves like a regular submit while requiring the user to confirm.
 */
export function ConfirmButton({
  children,
  variant = "danger",
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = true,
  className,
  disabled,
}: {
  children: ReactNode;
  variant?: Variant;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submitParentForm = () => {
    // Find the enclosing form and submit it. We use requestSubmit so
    // server actions (action={fn}) and validators fire as if the user
    // clicked a real submit button.
    const form = buttonRef.current?.closest("form") as HTMLFormElement | null;
    setOpen(false);
    if (form) {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        form.submit();
      }
    }
  };

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant={variant}
        disabled={disabled}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.42)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            className="rounded-lg w-full max-w-[420px] shadow-lg"
            style={{
              background: "var(--raised)",
              border: "1px solid var(--line-2)",
            }}
          >
            <div
              className="px-4 py-3"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <h2
                id="confirm-title"
                className="text-[14px] font-semibold m-0"
                style={{ color: "var(--ink)" }}
              >
                {title}
              </h2>
            </div>
            {body && (
              <div
                className="px-4 py-3 text-[12.5px]"
                style={{ color: "var(--ink-2)" }}
              >
                {body}
              </div>
            )}
            <div
              className="px-4 py-3 flex justify-end gap-2"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                {cancelLabel}
              </Button>
              <Button
                ref={confirmRef}
                type="button"
                variant={destructive ? "danger" : "primary"}
                onClick={submitParentForm}
                style={
                  destructive
                    ? {
                        background: "var(--p-review-bg)",
                        color: "var(--p-review-fg)",
                        border: "1px solid var(--p-review-fg)",
                      }
                    : undefined
                }
              >
                {confirmLabel ?? (destructive ? "Confirm" : "OK")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
