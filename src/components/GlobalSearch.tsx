"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SearchResult, SearchResultType } from "@/lib/search";

import { globalSearchAction } from "./GlobalSearchActions";

const TYPE_LABEL: Record<SearchResultType, string> = {
  client: "Clients",
  entity: "Entities",
  contact: "Contacts",
  invoice: "Invoices",
  bill: "Bills",
  journal_entry: "Journal Entries",
  account: "Accounts",
  asset: "Assets",
  bank_account: "Bank Accounts",
};

const TYPE_LABEL_SINGULAR: Record<SearchResultType, string> = {
  client: "Client",
  entity: "Entity",
  contact: "Contact",
  invoice: "Invoice",
  bill: "Bill",
  journal_entry: "Journal Entry",
  account: "Account",
  asset: "Asset",
  bank_account: "Bank Account",
};

const TYPE_ORDER: SearchResultType[] = [
  "client",
  "entity",
  "contact",
  "invoice",
  "bill",
  "journal_entry",
  "account",
  "asset",
  "bank_account",
];

const TYPE_ICON: Record<SearchResultType, string> = {
  client: "C",
  entity: "E",
  contact: "P",
  invoice: "I",
  bill: "B",
  journal_entry: "J",
  account: "#",
  asset: "A",
  bank_account: "$",
};

const TYPE_TINT: Record<SearchResultType, string> = {
  client: "var(--p-formation-bg)",
  entity: "var(--p-active-bg)",
  contact: "var(--p-pending-bg)",
  invoice: "var(--p-active-bg)",
  bill: "var(--p-review-bg)",
  journal_entry: "var(--p-formation-bg)",
  account: "var(--rail)",
  asset: "var(--p-pending-bg)",
  bank_account: "var(--p-formation-bg)",
};

const TYPE_TINT_FG: Record<SearchResultType, string> = {
  client: "var(--p-formation-fg)",
  entity: "var(--p-active-fg)",
  contact: "var(--p-pending-fg)",
  invoice: "var(--p-active-fg)",
  bill: "var(--p-review-fg)",
  journal_entry: "var(--p-formation-fg)",
  account: "var(--ink-3)",
  asset: "var(--p-pending-fg)",
  bank_account: "var(--p-formation-fg)",
};

const RECENT_KEY = "tw_search_recent";
const RECENT_MAX = 10;

type RecentItem = SearchResult;

function loadRecent(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentItem =>
        r &&
        typeof r === "object" &&
        typeof r.id === "string" &&
        typeof r.title === "string" &&
        typeof r.href === "string" &&
        typeof r.type === "string",
    );
  } catch {
    return [];
  }
}

function saveRecent(items: RecentItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(items));
  } catch {
    // ignore quota / serialization errors
  }
}

function pushRecent(item: RecentItem): RecentItem[] {
  const current = loadRecent();
  const without = current.filter(
    (r) => !(r.type === item.type && r.id === item.id),
  );
  const next = [item, ...without].slice(0, RECENT_MAX);
  saveRecent(next);
  return next;
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  // ⌘K / Ctrl+K to open, Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
      setActiveIndex(0);
      // Defer to next tick so the input is mounted before we focus it.
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!open) return;
    if (q.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestIdRef.current;
    const handle = window.setTimeout(async () => {
      try {
        const out = await globalSearchAction(q);
        if (id === requestIdRef.current) {
          setResults(out);
          setActiveIndex(0);
        }
      } finally {
        if (id === requestIdRef.current) setLoading(false);
      }
    }, 120);
    return () => window.clearTimeout(handle);
  }, [query, open]);

  // Group results by type, preserving TYPE_ORDER.
  const grouped = useMemo(() => {
    const map = new Map<SearchResultType, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.type) ?? [];
      arr.push(r);
      map.set(r.type, arr);
    }
    const ordered: Array<[SearchResultType, SearchResult[]]> = [];
    for (const t of TYPE_ORDER) {
      const arr = map.get(t);
      if (arr && arr.length > 0) ordered.push([t, arr]);
    }
    return ordered;
  }, [results]);

  // Flat list (in display order) for arrow-key navigation.
  const flatVisible = useMemo<SearchResult[]>(() => {
    if (query.trim().length === 0) return recent;
    return grouped.flatMap(([, items]) => items);
  }, [grouped, recent, query]);

  const select = useCallback(
    (item: SearchResult) => {
      pushRecent(item);
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) =>
          flatVisible.length === 0 ? 0 : (i + 1) % flatVisible.length,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) =>
          flatVisible.length === 0
            ? 0
            : (i - 1 + flatVisible.length) % flatVisible.length,
        );
      } else if (e.key === "Enter") {
        if (flatVisible[activeIndex]) {
          e.preventDefault();
          select(flatVisible[activeIndex]);
        }
      }
    },
    [activeIndex, flatVisible, select],
  );

  if (!open) return null;

  let runningIndex = -1;
  const showingRecent = query.trim().length === 0;
  const hasAny = flatVisible.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8vh 16px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: "var(--paper)",
          border: "1px solid var(--line-2)",
          borderRadius: 10,
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "78vh",
        }}
      >
        <div
          className="flex items-center gap-2 px-3.5 py-2.5"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <span
            style={{
              color: "var(--ink-4)",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
            }}
          >
            /
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, entities, contacts, invoices, bills, journal entries, accounts…"
            spellCheck={false}
            autoComplete="off"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 15,
              color: "var(--ink)",
            }}
          />
          {loading && (
            <span
              className="text-[11px]"
              style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}
            >
              …
            </span>
          )}
          <kbd
            style={{
              fontSize: 10.5,
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--rail)",
              border: "1px solid var(--line)",
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
            }}
          >
            esc
          </kbd>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {showingRecent && recent.length > 0 && (
            <Group label="Recent">
              {recent.map((r) => {
                runningIndex += 1;
                const idx = runningIndex;
                return (
                  <Row
                    key={`recent-${r.type}-${r.id}`}
                    item={r}
                    active={idx === activeIndex}
                    onSelect={() => select(r)}
                    onHover={() => setActiveIndex(idx)}
                  />
                );
              })}
            </Group>
          )}

          {!showingRecent &&
            grouped.map(([type, items]) => (
              <Group key={type} label={TYPE_LABEL[type]}>
                {items.map((r) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  return (
                    <Row
                      key={`${r.type}-${r.id}`}
                      item={r}
                      active={idx === activeIndex}
                      onSelect={() => select(r)}
                      onHover={() => setActiveIndex(idx)}
                    />
                  );
                })}
              </Group>
            ))}

          {!hasAny && (
            <div
              className="px-4 py-6 text-[13px] text-center"
              style={{ color: "var(--ink-3)" }}
            >
              {showingRecent
                ? "Start typing to search across the workspace."
                : loading
                  ? "Searching…"
                  : "No matches."}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between px-3.5 py-1.5 text-[11px]"
          style={{
            borderTop: "1px solid var(--line)",
            background: "var(--rail)",
            color: "var(--ink-4)",
          }}
        >
          <div className="flex items-center gap-3">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate
            </span>
            <span>
              <Kbd>↵</Kbd> open
            </span>
            <span>
              <Kbd>esc</Kbd> close
            </span>
          </div>
          <div>
            <Kbd>⌘</Kbd> + <Kbd>K</Kbd> anywhere
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div
        className="px-3.5 py-1 text-[10.5px] uppercase font-semibold"
        style={{ color: "var(--ink-4)", letterSpacing: "0.08em" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({
  item,
  active,
  onSelect,
  onHover,
}: {
  item: SearchResult;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onHover}
      className="w-full flex items-center gap-3 px-3.5 py-2 cursor-pointer"
      style={{
        background: active ? "var(--raised)" : "transparent",
        textAlign: "left",
        border: "none",
        borderLeft: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
      }}
    >
      <span
        className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md text-[11px] font-semibold shrink-0"
        style={{
          background: TYPE_TINT[item.type],
          color: TYPE_TINT_FG[item.type],
          fontFamily: "var(--font-mono)",
        }}
      >
        {TYPE_ICON[item.type]}
      </span>
      <div className="flex flex-col min-w-0 flex-1">
        <div
          className="text-[13px] truncate"
          style={{ color: "var(--ink)", fontWeight: 500 }}
        >
          {item.title}
        </div>
        {item.subtitle && (
          <div
            className="text-[11.5px] truncate"
            style={{ color: "var(--ink-3)" }}
          >
            {item.subtitle}
          </div>
        )}
      </div>
      <span
        className="text-[10.5px] uppercase shrink-0"
        style={{ color: "var(--ink-4)", letterSpacing: "0.05em" }}
      >
        {TYPE_LABEL_SINGULAR[item.type]}
      </span>
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        fontSize: 10,
        padding: "0 5px",
        borderRadius: 3,
        background: "var(--paper)",
        border: "1px solid var(--line)",
        color: "var(--ink-3)",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </kbd>
  );
}
