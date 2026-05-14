"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type SmartSelectOption = {
  value: string;
  label: string;
  /** Optional secondary text shown muted next to the label. */
  description?: string;
  /** Optional group label — options sharing a group render together under a heading. */
  group?: string;
  disabled?: boolean;
  /**
   * Extra text included in the substring search but not displayed (e.g. account
   * code or contact email).
   */
  search?: string;
};

type Variant = "input" | "cell";

type BaseProps = {
  options?: SmartSelectOption[];
  placeholder?: string;
  /** Shown when value is empty. Falls back to `placeholder`. */
  emptyLabel?: string;
  clearable?: boolean;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  ariaLabel?: string;
  /** Render variant — "input" for stand-alone form fields, "cell" for spreadsheet cells. */
  variant?: Variant;
  className?: string;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  /** Server-side search. Called on each keystroke (debounced). */
  loadOptions?: (query: string) => Promise<SmartSelectOption[]>;
  /**
   * Options used to resolve the initial label(s) when in async mode and
   * the user hasn't typed anything yet. Typically the currently-selected
   * option(s) prefetched on the server.
   */
  initialOptions?: SmartSelectOption[];
  emptyMessage?: string;
  noResultsMessage?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
};

type MultiProps = BaseProps & {
  multiple: true;
  value?: string[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
};

export type SmartSelectProps = SingleProps | MultiProps;

const DEBOUNCE_MS = 200;

const triggerInputStyle: CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line-2)",
  color: "var(--ink)",
  borderRadius: 6,
  padding: "5px 28px 5px 8px",
  fontSize: 12.5,
  textAlign: "left",
  width: "100%",
  display: "inline-flex",
  alignItems: "center",
  cursor: "pointer",
  minHeight: 28,
  position: "relative",
};

const triggerCellStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--ink)",
  padding: "4px 22px 4px 8px",
  fontSize: 12.5,
  textAlign: "left",
  width: "100%",
  display: "inline-flex",
  alignItems: "center",
  cursor: "pointer",
  minHeight: 26,
  position: "relative",
};

function isSingle(p: SmartSelectProps): p is SingleProps {
  return !p.multiple;
}

function normalize(q: string) {
  return q.trim().toLowerCase();
}

function filterOptions(options: SmartSelectOption[], q: string) {
  if (!q) return options;
  const n = normalize(q);
  return options.filter((o) => {
    const hay = `${o.label} ${o.description ?? ""} ${o.search ?? ""}`.toLowerCase();
    return hay.includes(n);
  });
}

function groupOptions(options: SmartSelectOption[]) {
  const groups = new Map<string, SmartSelectOption[]>();
  const ungrouped: SmartSelectOption[] = [];
  for (const o of options) {
    if (o.group) {
      const arr = groups.get(o.group) ?? [];
      arr.push(o);
      groups.set(o.group, arr);
    } else {
      ungrouped.push(o);
    }
  }
  return { ungrouped, groups };
}

export function SmartSelect(props: SmartSelectProps) {
  const {
    options: optionsProp,
    placeholder,
    emptyLabel,
    clearable = false,
    disabled = false,
    required = false,
    name,
    id,
    ariaLabel,
    variant = "input",
    className,
    triggerClassName,
    triggerStyle,
    loadOptions,
    initialOptions,
    emptyMessage = "No options",
    noResultsMessage = "No results",
  } = props;

  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // ---- Value state (controlled or uncontrolled) ----
  const single = isSingle(props);
  const [internalSingle, setInternalSingle] = useState<string>(
    single ? (props.defaultValue ?? "") : "",
  );
  const [internalMulti, setInternalMulti] = useState<string[]>(
    single ? [] : (props.defaultValue ?? []),
  );

  const currentSingle = single
    ? (props.value !== undefined ? props.value : internalSingle)
    : "";
  const currentMulti = !single
    ? (props.value !== undefined ? props.value : internalMulti)
    : [];

  function setSingle(next: string) {
    if (props.value === undefined && single) setInternalSingle(next);
    if (single) (props as SingleProps).onChange?.(next);
  }
  function setMulti(next: string[]) {
    if (props.value === undefined && !single) setInternalMulti(next);
    if (!single) (props as MultiProps).onChange?.(next);
  }

  // ---- Dropdown open / query / async options ----
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [asyncOptions, setAsyncOptions] = useState<SmartSelectOption[]>(
    loadOptions ? (initialOptions ?? []) : [],
  );
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const allOptions = useMemo<SmartSelectOption[]>(() => {
    if (loadOptions) {
      // In async mode, asyncOptions are already filtered server-side; we
      // still merge selected options so the labels render correctly.
      const merged = new Map<string, SmartSelectOption>();
      for (const o of asyncOptions) merged.set(o.value, o);
      for (const o of initialOptions ?? []) {
        if (!merged.has(o.value)) merged.set(o.value, o);
      }
      return Array.from(merged.values());
    }
    return optionsProp ?? [];
  }, [loadOptions, asyncOptions, initialOptions, optionsProp]);

  const filtered = useMemo(() => {
    if (loadOptions) return asyncOptions;
    return filterOptions(allOptions, query);
  }, [loadOptions, asyncOptions, allOptions, query]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlight(0);
  }, [query, open, filtered.length]);

  // ---- Async loader (debounced) ----
  useEffect(() => {
    if (!loadOptions || !open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const result = await loadOptions(query);
        if (!cancelled) setAsyncOptions(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [loadOptions, query, open]);

  // ---- Display label(s) for the trigger ----
  const optionByValue = useMemo(() => {
    const m = new Map<string, SmartSelectOption>();
    for (const o of allOptions) m.set(o.value, o);
    for (const o of initialOptions ?? []) if (!m.has(o.value)) m.set(o.value, o);
    return m;
  }, [allOptions, initialOptions]);

  let displayNode: ReactNode;
  if (single) {
    // Look up the option even for empty-string values — some forms use ""
    // as a valid sentinel option (e.g. an Inactive/Off choice).
    const opt = optionByValue.get(currentSingle);
    if (opt) {
      displayNode = (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {opt.label}
          {opt.description && (
            <span style={{ color: "var(--ink-4)", marginLeft: 6 }}>
              {opt.description}
            </span>
          )}
        </span>
      );
    } else {
      displayNode = (
        <span style={{ color: "var(--ink-4)" }}>
          {emptyLabel ?? placeholder ?? "Select…"}
        </span>
      );
    }
  } else {
    if (currentMulti.length === 0) {
      displayNode = (
        <span style={{ color: "var(--ink-4)" }}>
          {emptyLabel ?? placeholder ?? "Select…"}
        </span>
      );
    } else if (currentMulti.length <= 2) {
      const labels = currentMulti
        .map((v) => optionByValue.get(v)?.label ?? v)
        .join(", ");
      displayNode = (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {labels}
        </span>
      );
    } else {
      displayNode = (
        <span>
          {currentMulti.length} selected
        </span>
      );
    }
  }

  // ---- Open / close handling ----
  function openMenu() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  }
  function closeMenu() {
    setOpen(false);
    setQuery("");
  }
  function toggleMenu() {
    if (open) closeMenu();
    else openMenu();
  }

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const tgt = e.target as Node | null;
      if (!tgt) return;
      if (triggerRef.current?.contains(tgt)) return;
      if (listRef.current?.contains(tgt)) return;
      closeMenu();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Focus the search input when opened
  useEffect(() => {
    if (open) {
      // next tick so the input is mounted
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ---- Selection ----
  const selectOption = useCallback(
    (opt: SmartSelectOption) => {
      if (opt.disabled) return;
      if (single) {
        setSingle(opt.value);
        closeMenu();
        // restore focus to the trigger so the form can tab forward
        setTimeout(() => triggerRef.current?.focus(), 0);
      } else {
        const set = new Set(currentMulti);
        if (set.has(opt.value)) set.delete(opt.value);
        else set.add(opt.value);
        setMulti(Array.from(set));
        // Keep menu open for multi
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [single, currentMulti],
  );

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    if (single) setSingle("");
    else setMulti([]);
  }

  // ---- Keyboard nav (on the search input or trigger) ----
  function onKey(e: KeyboardEvent<HTMLElement>) {
    if (disabled) return;
    if (!open) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      setTimeout(() => triggerRef.current?.focus(), 0);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setHighlight(Math.max(filtered.length - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) selectOption(opt);
      return;
    }
    if (e.key === "Tab") {
      closeMenu();
      return;
    }
  }

  // ---- Hidden inputs for form submission ----
  const hidden: ReactNode = name
    ? single
      ? (
          <input
            type="hidden"
            name={name}
            value={currentSingle}
            required={required}
          />
        )
      : (
          <>
            {currentMulti.length === 0 ? (
              <input type="hidden" name={name} value="" required={required} />
            ) : (
              currentMulti.map((v) => (
                <input key={v} type="hidden" name={name} value={v} />
              ))
            )}
          </>
        )
    : null;

  const baseStyle = variant === "cell" ? triggerCellStyle : triggerInputStyle;

  return (
    <div
      className={className}
      style={{ position: "relative", display: "inline-block", width: "100%" }}
    >
      {hidden}
      <button
        type="button"
        ref={triggerRef}
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={toggleMenu}
        onKeyDown={onKey}
        className={triggerClassName}
        style={{
          ...baseStyle,
          ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : null),
          ...triggerStyle,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayNode}
        </span>
        {clearable && (single ? currentSingle : currentMulti.length > 0) && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={clear}
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: "absolute",
              right: 22,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-4)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: "0 2px",
            }}
          >
            ×
          </span>
        )}
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--ink-4)",
            fontSize: 10,
            pointerEvents: "none",
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <Popover triggerRef={triggerRef}>
          <div
            ref={listRef}
            style={{
              background: "var(--raised)",
              border: "1px solid var(--line-2)",
              borderRadius: 8,
              boxShadow:
                "0 2px 6px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.10)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              maxHeight: 320,
              minWidth: "100%",
            }}
          >
            <div
              style={{
                padding: 6,
                borderBottom: "1px solid var(--line)",
                background: "var(--paper)",
              }}
            >
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder="Search…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                aria-autocomplete="list"
                aria-controls={listboxId}
                style={{
                  width: "100%",
                  padding: "5px 8px",
                  fontSize: 12.5,
                  border: "1px solid var(--line-2)",
                  borderRadius: 6,
                  background: "var(--paper)",
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
            </div>
            <div
              role="listbox"
              id={listboxId}
              aria-multiselectable={!single}
              style={{
                overflowY: "auto",
                maxHeight: 260,
                padding: "2px 0",
              }}
            >
              <OptionList
                filtered={filtered}
                highlight={highlight}
                loading={loading}
                isMulti={!single}
                currentSingle={currentSingle}
                currentMulti={currentMulti}
                onHover={setHighlight}
                onSelect={selectOption}
                emptyMessage={
                  allOptions.length === 0 ? emptyMessage : noResultsMessage
                }
              />
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}

// ---- Sub-components ----

function OptionList({
  filtered,
  highlight,
  loading,
  isMulti,
  currentSingle,
  currentMulti,
  onHover,
  onSelect,
  emptyMessage,
}: {
  filtered: SmartSelectOption[];
  highlight: number;
  loading: boolean;
  isMulti: boolean;
  currentSingle: string;
  currentMulti: string[];
  onHover: (idx: number) => void;
  onSelect: (opt: SmartSelectOption) => void;
  emptyMessage: string;
}) {
  if (loading && filtered.length === 0) {
    return (
      <div
        style={{ padding: "10px 12px", color: "var(--ink-4)", fontSize: 12.5 }}
      >
        Loading…
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <div
        style={{ padding: "10px 12px", color: "var(--ink-4)", fontSize: 12.5 }}
      >
        {emptyMessage}
      </div>
    );
  }

  const { ungrouped, groups } = groupOptions(filtered);
  const renderRow = (opt: SmartSelectOption, index: number) => {
    const isHL = index === highlight;
    const selected = isMulti
      ? currentMulti.includes(opt.value)
      : currentSingle === opt.value;
    return (
      <div
        key={opt.value}
        role="option"
        aria-selected={selected}
        aria-disabled={opt.disabled || undefined}
        onMouseEnter={() => onHover(index)}
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect(opt);
        }}
        style={{
          padding: "6px 10px",
          fontSize: 12.5,
          cursor: opt.disabled ? "not-allowed" : "pointer",
          background: isHL ? "var(--hover)" : "transparent",
          color: opt.disabled ? "var(--ink-4)" : "var(--ink)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: opt.disabled ? 0.6 : 1,
        }}
      >
        {isMulti && (
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              width: 12,
              height: 12,
              border: "1px solid var(--line-2)",
              borderRadius: 3,
              background: selected ? "var(--ink)" : "var(--paper)",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--paper)",
              fontSize: 9,
              lineHeight: 1,
              flex: "0 0 auto",
            }}
          >
            {selected ? "✓" : ""}
          </span>
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {opt.label}
          {opt.description && (
            <span style={{ color: "var(--ink-4)", marginLeft: 6 }}>
              {opt.description}
            </span>
          )}
        </span>
        {!isMulti && selected && (
          <span style={{ color: "var(--ink-3)", fontSize: 11 }}>✓</span>
        )}
      </div>
    );
  };

  // Build a flat index counter so highlight indices line up with `filtered`.
  let cursor = 0;
  const ungroupedNodes = ungrouped.map((opt) => renderRow(opt, cursor++));
  const groupNodes: ReactNode[] = [];
  for (const [name, opts] of groups) {
    groupNodes.push(
      <div
        key={`group-head-${name}`}
        style={{
          padding: "6px 10px 2px",
          fontSize: 10.5,
          color: "var(--ink-4)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {name}
      </div>,
    );
    for (const opt of opts) groupNodes.push(renderRow(opt, cursor++));
  }
  return (
    <>
      {ungroupedNodes}
      {groupNodes}
    </>
  );
}

function Popover({
  triggerRef,
  children,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.bottom + 4, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [triggerRef]);

  if (!mounted || typeof document === "undefined" || !rect) return null;

  // Clamp the popover so it doesn't bleed off the right edge of the viewport
  // and gets at least 220px of horizontal room.
  const minW = Math.max(rect.width, 240);
  const maxLeft = Math.max(8, window.innerWidth - minW - 8);
  const left = Math.min(rect.left, maxLeft);

  return createPortal(
    <div
      style={{
        position: "fixed",
        left,
        top: rect.top,
        width: minW,
        zIndex: 1000,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ---- Convenience wrapper that mimics SelectField (label + required + help) ----

export function SmartSelectField({
  label,
  required,
  help,
  className,
  ...rest
}: SmartSelectProps & {
  label?: ReactNode;
  required?: boolean;
  help?: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label && (
        <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {label}
          {required && (
            <span style={{ color: "var(--p-review-fg)" }}> *</span>
          )}
        </span>
      )}
      <SmartSelect required={required} {...(rest as SmartSelectProps)} />
      {help && (
        <span
          className="text-[11px]"
          style={{ color: "var(--ink-4)", lineHeight: 1.4 }}
        >
          {help}
        </span>
      )}
    </label>
  );
}
