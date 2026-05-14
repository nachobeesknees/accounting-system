/**
 * Period preset logic for Reporting v2. Pure date math — no DB, no React.
 *
 * Dates are passed and returned as ISO `YYYY-MM-DD` strings, treating
 * everything in UTC so a "today" of `2026-05-13T00:00:00Z` yields a
 * "this month" of 2026-05-01..2026-05-31 regardless of the runtime tz.
 */

export type PeriodPreset =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "ytd"
  | "last_year"
  | "custom";

export type ResolvedPeriod = {
  start: string;
  end: string;
  label: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ymd(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

function daysInMonth(year: number, month1: number): number {
  // month1: 1..12. Use UTC trick: day 0 of next month.
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function startOfMonth(year: number, month1: number): string {
  return ymd(year, month1, 1);
}

function endOfMonth(year: number, month1: number): string {
  return ymd(year, month1, daysInMonth(year, month1));
}

function quarterOf(month1: number): number {
  return Math.floor((month1 - 1) / 3) + 1; // 1..4
}

function quarterRange(year: number, q: number): { start: string; end: string; label: string } {
  // q normalized into 1..4; if out of range, adjust year.
  let y = year;
  let qn = q;
  while (qn < 1) {
    qn += 4;
    y -= 1;
  }
  while (qn > 4) {
    qn -= 4;
    y += 1;
  }
  const startMonth = (qn - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    start: startOfMonth(y, startMonth),
    end: endOfMonth(y, endMonth),
    label: `Q${qn} ${y}`,
  };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function isValidIsoDate(s: string | undefined | null): s is string {
  if (!s) return false;
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function resolvePeriod(
  preset: PeriodPreset,
  today: Date,
  from?: string,
  to?: string,
): ResolvedPeriod {
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1; // 1..12

  switch (preset) {
    case "this_month": {
      return {
        start: startOfMonth(ty, tm),
        end: endOfMonth(ty, tm),
        label: `${MONTH_NAMES[tm - 1]} ${ty}`,
      };
    }
    case "last_month": {
      const lm = tm === 1 ? 12 : tm - 1;
      const ly = tm === 1 ? ty - 1 : ty;
      return {
        start: startOfMonth(ly, lm),
        end: endOfMonth(ly, lm),
        label: `${MONTH_NAMES[lm - 1]} ${ly}`,
      };
    }
    case "this_quarter": {
      return quarterRange(ty, quarterOf(tm));
    }
    case "last_quarter": {
      return quarterRange(ty, quarterOf(tm) - 1);
    }
    case "ytd": {
      return {
        start: startOfMonth(ty, 1),
        end: ymd(ty, tm, today.getUTCDate()),
        label: `${ty} YTD`,
      };
    }
    case "last_year": {
      return {
        start: ymd(ty - 1, 1, 1),
        end: ymd(ty - 1, 12, 31),
        label: `FY ${ty - 1}`,
      };
    }
    case "custom": {
      const okFrom = isValidIsoDate(from);
      const okTo = isValidIsoDate(to);
      if (okFrom && okTo) {
        return {
          start: from!,
          end: to!,
          label: `${from} → ${to}`,
        };
      }
      // Fallback: degrade to YTD if custom dates are missing/invalid.
      return resolvePeriod("ytd", today);
    }
  }
}

function parseIso(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

function diffDaysInclusive(start: string, end: string): number {
  const s = parseIso(start).getTime();
  const e = parseIso(end).getTime();
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function shiftDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftYears(iso: string, years: number): string {
  const d = parseIso(iso);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the period of equal length immediately preceding [start, end].
 *
 *   priorPeriod("2026-04-01", "2026-04-30") → 2026-03-02..2026-03-31
 *
 * Length is preserved exactly (inclusive day count), which matches how
 * QuickBooks / Xero do "previous period" comparisons.
 */
export function priorPeriod(start: string, end: string): { start: string; end: string } {
  const len = diffDaysInclusive(start, end);
  const newEnd = shiftDays(start, -1);
  const newStart = shiftDays(newEnd, -(len - 1));
  return { start: newStart, end: newEnd };
}

/**
 * Same calendar window, one year back. Useful for "vs. last year" deltas
 * that should compare like-for-like seasonality.
 */
export function priorYearPeriod(start: string, end: string): { start: string; end: string } {
  return { start: shiftYears(start, -1), end: shiftYears(end, -1) };
}

export const PERIOD_PRESET_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "ytd", label: "YTD" },
  { value: "last_year", label: "Last Year" },
  { value: "custom", label: "Custom" },
];

export function parsePreset(raw: string | undefined | null): PeriodPreset {
  switch (raw) {
    case "this_month":
    case "last_month":
    case "this_quarter":
    case "last_quarter":
    case "ytd":
    case "last_year":
    case "custom":
      return raw;
    default:
      return "ytd";
  }
}

export type CompareMode = "none" | "prior_period" | "prior_year" | "budget";

export function parseCompare(raw: string | undefined | null): CompareMode {
  switch (raw) {
    case "none":
    case "prior_period":
    case "prior_year":
    case "budget":
      return raw;
    default:
      return "none";
  }
}

export const COMPARE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: "none", label: "No comparison" },
  { value: "prior_period", label: "Prior Period" },
  { value: "prior_year", label: "Prior Year" },
  { value: "budget", label: "Budget" },
];
