"use client";

export function SidebarToggle() {
  return (
    <button
      type="button"
      className="menu-toggle items-center justify-center rounded-md cursor-pointer"
      style={{
        width: 28,
        height: 28,
        background: "transparent",
        border: "1px solid var(--line-2)",
        color: "var(--ink-2)",
      }}
      aria-label="Toggle navigation menu"
      onClick={() => {
        window.dispatchEvent(new Event("sidebar:toggle"));
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2 4h12M2 8h12M2 12h12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
