"use client";

import { useState } from "react";
import { IconClose, IconMenu } from "./ui/Icon";

/**
 * Mobile-only hamburger that opens the sidebar drawer. We toggle a class on
 * <html> so the rest of the layout — Sidebar plus an overlay — can react via
 * CSS without lifting any state into the server-rendered shell.
 */
export function SidebarToggle() {
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("sidebar-open", next);
    }
  }

  function close() {
    setOpen(false);
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("sidebar-open");
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={toggle}
        className="sidebar-toggle inline-flex items-center justify-center w-7 h-7 rounded-md"
        style={{
          color: "var(--ink-3)",
          background: "transparent",
          border: "1px solid transparent",
        }}
      >
        {open ? <IconClose size={16} /> : <IconMenu size={16} />}
      </button>
      <div
        className="sidebar-overlay"
        onClick={close}
        aria-hidden={!open}
      />
    </>
  );
}
