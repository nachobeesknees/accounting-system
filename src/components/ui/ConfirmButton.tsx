"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium cursor-pointer transition-colors";

function dangerStyle(): React.CSSProperties {
  return {
    background: "var(--p-review-fg)",
    color: "#fff",
    border: "1px solid var(--p-review-fg)",
  };
}

function dangerGhostStyle(): React.CSSProperties {
  return {
    background: "transparent",
    color: "var(--p-review-fg)",
    border: "1px solid transparent",
  };
}

function secondaryStyle(): React.CSSProperties {
  return {
    background: "var(--raised)",
    color: "var(--ink)",
    border: "1px solid var(--line-2)",
  };
}

function primaryStyle(): React.CSSProperties {
  return {
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "1px solid var(--accent)",
  };
}

/**
 * Wraps a destructive submit button with a confirmation modal. The submit is
 * blocked until the user clicks Confirm (and optionally types a phrase) —
 * protects against accidental clicks on rows like "Delete entity" or
 * "Void journal entry".
 *
 * Must live inside a <form>. On confirm it programmatically submits the
 * surrounding form so server actions keep working.
 */
export function ConfirmButton({
  label,
  title,
  message,
  confirmText,
  className,
  intent = "danger",
  requirePhrase,
}: {
  label: ReactNode;
  title: ReactNode;
  message: ReactNode;
  confirmText?: string;
  className?: string;
  intent?: "danger" | "primary";
  /** If set, the user must type this string to enable the Confirm button. */
  requirePhrase?: string;
}) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function openModal() {
    setPhrase("");
    setOpen(true);
  }

  function submitForm() {
    const form = btnRef.current?.closest("form");
    if (!form) return;
    setOpen(false);
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.submit();
  }

  const phraseOk = !requirePhrase || phrase === requirePhrase;
  const triggerStyle = intent === "danger" ? dangerGhostStyle() : primaryStyle();

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openModal}
        className={`${BASE} ${className ?? ""}`}
        style={triggerStyle}
      >
        {label}
      </button>
      {open && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              background: "var(--raised)",
              border: "1px solid var(--line-2)",
              borderRadius: 8,
              maxWidth: 440,
              width: "100%",
              padding: "16px 18px",
              color: "var(--ink)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 6,
                color: "var(--ink)",
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--ink-3)",
                marginBottom: 14,
                lineHeight: 1.55,
              }}
            >
              {message}
            </div>
            {requirePhrase && (
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginBottom: 14,
                }}
              >
                <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                  Type{" "}
                  <code style={{ color: "var(--ink)" }}>{requirePhrase}</code>{" "}
                  to confirm
                </span>
                <input
                  autoFocus
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    fontSize: 13,
                    borderRadius: 6,
                    background: "var(--paper)",
                    border: "1px solid var(--line-2)",
                    color: "var(--ink)",
                    outline: "none",
                    fontFamily: "var(--font-mono)",
                  }}
                />
              </label>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={BASE}
                style={secondaryStyle()}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!phraseOk}
                onClick={submitForm}
                className={BASE}
                style={{
                  ...(intent === "danger" ? dangerStyle() : primaryStyle()),
                  opacity: phraseOk ? 1 : 0.5,
                  cursor: phraseOk ? "pointer" : "not-allowed",
                }}
              >
                {confirmText ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
