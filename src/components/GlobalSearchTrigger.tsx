"use client";

import { useEffect, useState } from "react";

/**
 * Visible affordance for ⌘K. Dispatches a synthetic keydown so the search
 * modal (mounted by AppShell) opens via the same code path as the shortcut.
 */
export function GlobalSearchTrigger() {
  // Defer platform sniffing to after hydration — `navigator` is undefined on
  // the server, so reading it during render produces SSR/CSR text mismatches
  // (React error #418). We render "⌘K" as the default and swap to "Ctrl+K"
  // on non-Mac browsers after mount.
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(/mac/i.test(navigator.platform));
  }, []);

  function open() {
    const ev = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      ctrlKey: navigator.userAgent.includes("Mac") ? false : true,
      bubbles: true,
    });
    window.dispatchEvent(ev);
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Open global search"
      className="topbar-search hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md text-[12px] cursor-pointer"
      style={{
        background: "var(--rail)",
        color: "var(--ink-3)",
        border: "1px solid var(--line)",
        minWidth: 220,
      }}
    >
      <span style={{ color: "var(--ink-4)" }}>Search…</span>
      <span style={{ flex: 1 }} />
      <kbd
        style={{
          fontSize: 10.5,
          padding: "0 5px",
          borderRadius: 3,
          background: "var(--paper)",
          border: "1px solid var(--line)",
          color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {isMac ? "⌘K" : "Ctrl+K"}
      </kbd>
    </button>
  );
}
