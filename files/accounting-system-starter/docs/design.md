# Design Direction

This document captures the locked design language for the system. It exists so that Claude Code and any future engineer produces UI consistent with the intended feel, rather than reinventing each screen.

**Direction:** Modern SaaS with sidebar navigation. Reference points: Sage Intacct, Linear's table views, Mercury's accounting UI. Familiar, comfortable, productive.

## Layout

- **Left sidebar:** ~180px wide, persistent, contains entity switcher (top) + grouped navigation + settings (bottom)
- **Main content area:** fills remaining width
- **Top of main area:** screen title, contextual selectors (period, etc.), search (Cmd-K accessible), screen-level actions (export, etc.)
- **Below header:** metric/summary row where relevant (4 cards typical), then content (table, form, etc.)

## Sidebar structure

Three navigation groups, in order:

1. **General** — Dashboard, Journal entries, Trial balance, Periods
2. **Subledgers** — AP, AR, Banking, Fixed assets
3. **Group** — Consolidation, Intercompany, Reports

Settings docked at sidebar bottom. Entity switcher at sidebar top with a color-coded badge to make context obvious when switching among 16-50 entities.

Navigation items show count badges where work is pending (e.g., "AP: 12" unposted bills, "Intercompany: 3" with an amber tint for unmatched entries). Badges are subtle, not loud.

## Typography

- **Body text:** 13-14px, weight 400
- **Headings:** 16px h2, 14px h3, weight 500
- **Code/account numbers:** monospace, 12px, muted color
- **Labels in cards:** 12px, muted color
- **Section dividers in tables:** 11px uppercase, letter-spacing 0.04em
- **Section labels in sidebar:** 10px uppercase, letter-spacing 0.04em, muted
- Two weights only: 400 regular, 500 medium. Never 600 or 700.
- **Sentence case throughout.** Never title case, never all caps (except the small UPPERCASE labels noted above).

## Color discipline

This is the most important rule: **color is reserved for meaning, not decoration.**

- **Default state:** monochrome (grays, with the host background as canvas)
- **Green (success):** balanced trial balance, completed reconciliation, posted entry, paid bill
- **Amber (warning):** unmatched intercompany, period closing soon, FX rate stale, approval pending
- **Red (error/negative):** out-of-balance entries, failed reconciliation, overdue bill
- **Blue (info):** informational badges, current selection, links

Never use color decoratively. Never use rainbow palettes. An accounting UI with green/red everywhere becomes noise; restraint pays off.

## Tables (the core of the experience)

Most accounting screens are tables. They must be:

- **Tabular-nums** font feature for digit alignment. Non-negotiable.
- **Right-aligned numeric columns.** Always.
- **Em-dashes (—) for zero/null values** in numeric columns. Visually quieter than `0.00` everywhere.
- **Section grouping** within tables (Assets / Liabilities / Equity in TB; aging buckets in AR; etc.) via subtle gray bands with uppercase labels.
- **Currency badges** inline on multi-currency accounts (small pills with the ISO code).
- **Row height:** 36-40px. Comfortable but dense enough to show 12-15 rows on a typical laptop screen.
- **Header row:** slightly darker background, 12px text, weight 500.
- **No zebra striping.** Use border-bottom on each row instead.
- **No hover highlight on tables for read-only views.** Reserve hover for actionable rows.
- **Click row to drill down** where applicable. Right-click for context menu (Phase 2+).

## Forms (journal entries, bills, etc.)

- **Two-column layout** for form fields where space allows
- **Account selectors are autocomplete inputs**, not dropdowns (with 100s of accounts per entity, dropdowns are useless)
- **Inline validation** with red border + small message under field
- **Sticky save/cancel footer** for long forms
- **Keyboard-first:** Tab through fields, Enter saves drafts, Cmd+Enter posts (where applicable), Esc cancels
- **Currency-aware money inputs:** display with thousand separators per locale, store as Decimal

## Modals and overlays

- Used sparingly. Most actions are full-screen views or sidebars, not modals.
- Modals are reserved for: confirmations (delete, post, lock period), quick-add forms (new vendor inline), bulk action review.
- Cmd-K palette is the exception — modal, full-width search-first interface, always one keystroke away.

## Cmd-K (command palette)

Always available via Cmd+K (Mac) / Ctrl+K (Win). Searches:

- Entities (switch to any entity)
- Accounts (jump to any account's ledger view)
- Journal entries (by number, date, amount, description)
- Vendors, customers
- Reports (launch any saved report)
- Actions ("Close period", "Create JE", "Run consolidation")

Not aggressive — Cmd-K is opt-in. Mouse users navigate via sidebar; power users live in Cmd-K. Both work.

## Density modes

User preference toggle: **Comfortable / Compact / Dense**.

- Comfortable: 40px rows, 14px text, more padding
- Compact: 36px rows, 13px text (default)
- Dense: 30px rows, 12px text, minimal padding

Stored per user. Power users (controllers, daily bookkeepers) will set Dense; occasional users will leave it on Compact.

## Dark mode

Mandatory. CSS variables for all colors. Tested in both modes during every feature build.

## Print/PDF rendering

Separate print stylesheet from day one. Financial statements, PBC schedules, and reports must render correctly on US Letter and A4 paper. This isn't a polish concern — auditors and management consume PDFs more than the live UI.

Key print rules:
- Sidebar hidden in print
- Sufficient margins
- Page breaks before major sections
- Page numbers in footers
- Entity name + period + report title in header on every page

## Mobile

For the 6-15 power users in v1, mobile is "must look acceptable, not break." Don't over-invest. Phase 2 time-entry users get a separate mobile-first interface.

## Component library

Build on Tailwind CSS. Reference shadcn/ui for component patterns (don't pull as a dependency — copy patterns). Build a small in-house component set:

- `<Table>` with built-in tabular-nums, section grouping, currency formatting
- `<MoneyInput>` with locale-aware formatting + Decimal storage
- `<AccountSelector>` autocomplete with code + name + entity scoping
- `<EntitySwitcher>` for the sidebar top
- `<MetricCard>` for the 4-card summary row
- `<DateRangePicker>` with period awareness (snap to period boundaries)
- `<StatusBadge>` for entry/bill/recon status with semantic colors
- `<CmdK>` palette

Resist the temptation to add components beyond what's actually used. Component sprawl is its own technical debt.

## Inspiration / reference

When designing a new screen, look at these for general direction (not pixel-perfect copy):

- **Linear** — table density, command palette, keyboard shortcuts
- **Sage Intacct** — accounting-specific information architecture
- **Mercury** — modern financial UI restraint, color discipline
- **Stripe Dashboard** — data density without claustrophobia
- **Notion** — sidebar information hierarchy

When in doubt, more restraint, less color, denser data.
