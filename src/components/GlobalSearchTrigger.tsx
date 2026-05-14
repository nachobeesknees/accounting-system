"use client";

/**
 * Visible affordance for ⌘K. Dispatches a synthetic keydown so the search
 * modal (mounted by AppShell) opens via the same code path as the shortcut.
 */
export function GlobalSearchTrigger() {
  function open() {
    const ev = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      ctrlKey: navigator.userAgent.includes("Mac") ? false : true,
      bubbles: true,
    });
    window.dispatchEvent(ev);
  }

  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

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
