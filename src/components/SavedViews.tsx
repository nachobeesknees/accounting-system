"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { saveViewAction, deleteViewAction } from "@/app/(app)/saved-view-actions";

export type SavedViewOption = {
  id: string;
  name: string;
  params: Record<string, string>;
  isDefault: boolean;
};

/**
 * Saved-views control for a list page. Thin layer over the URL filter/sort
 * params: applying a view just navigates to `route?<params>`; saving snapshots
 * the CURRENT params. Every view is scoped to the current user on the server.
 */
export function SavedViews({
  route,
  views,
}: {
  route: string;
  views: SavedViewOption[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  // Serialized snapshot of the current filters/sort — everything except
  // one-off params (paging/errors are stripped again server-side).
  const currentQs = (() => {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    next.delete("error");
    return next.toString();
  })();

  function applyView(id: string) {
    if (id === "") return;
    const v = views.find((x) => x.id === id);
    if (!v) return;
    const qs = new URLSearchParams(v.params).toString();
    router.push(`${route}${qs ? `?${qs}` : ""}`);
  }

  const controlStyle: React.CSSProperties = {
    background: "var(--paper)",
    border: "1px solid var(--line-2)",
    borderRadius: 5,
    padding: "6px 8px",
    fontSize: 12.5,
    color: "var(--ink)",
  };

  return (
    <div className="flex flex-col gap-1 no-print">
      <span
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Saved views
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          defaultValue=""
          onChange={(e) => applyView(e.currentTarget.value)}
          style={{ ...controlStyle, minWidth: 170 }}
          aria-label="Apply a saved view"
        >
          <option value="">
            {views.length === 0 ? "No saved views" : "Apply a saved view…"}
          </option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>

        {/* Delete — one small form per view, shown as a compact list */}
        {views.length > 0 && (
          <details className="relative">
            <summary
              style={{
                ...controlStyle,
                cursor: "pointer",
                listStyle: "none",
              }}
            >
              Manage
            </summary>
            <div
              className="absolute z-20 mt-1 flex flex-col gap-1 p-2 rounded-md"
              style={{
                background: "var(--raised)",
                border: "1px solid var(--line-2)",
                minWidth: 220,
              }}
            >
              {views.map((v) => (
                <form
                  key={v.id}
                  action={deleteViewAction}
                  className="flex items-center justify-between gap-2"
                >
                  <input type="hidden" name="route" value={route} />
                  <input type="hidden" name="viewId" value={v.id} />
                  <span
                    style={{ fontSize: 12, color: "var(--ink-2)" }}
                    className="truncate"
                  >
                    {v.name}
                    {v.isDefault ? " (default)" : ""}
                  </span>
                  <button
                    type="submit"
                    style={{
                      fontSize: 11,
                      color: "var(--p-review-fg)",
                      background: "transparent",
                      border: "1px solid var(--line-2)",
                      borderRadius: 4,
                      padding: "1px 6px",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </form>
              ))}
            </div>
          </details>
        )}

        {!saving ? (
          <button
            type="button"
            onClick={() => setSaving(true)}
            style={{ ...controlStyle, cursor: "pointer" }}
          >
            + Save current
          </button>
        ) : (
          <form action={saveViewAction} className="flex items-center gap-1.5">
            <input type="hidden" name="route" value={route} />
            <input type="hidden" name="params" value={currentQs} />
            <input type="hidden" name="makeDefault" value={makeDefault ? "1" : ""} />
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="View name"
              autoFocus
              required
              style={{ ...controlStyle, minWidth: 130 }}
            />
            <label
              className="flex items-center gap-1"
              style={{ fontSize: 11.5, color: "var(--ink-3)" }}
            >
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={(e) => setMakeDefault(e.currentTarget.checked)}
              />
              Default
            </label>
            <button
              type="submit"
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
                border: "1px solid var(--accent)",
                borderRadius: 5,
                padding: "6px 10px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setSaving(false)}
              style={{ ...controlStyle, cursor: "pointer" }}
            >
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
