/**
 * Shared vocabulary + date helpers for the compliance chain (entity
 * filings, KYC/AML reviews, distributions). Pure functions only — safe
 * to import from both server components and client components.
 */

import type {
  FilingKind,
  FilingRecurrence,
  FilingStatus,
  KycReviewOutcome,
  KycStatus,
  RiskRating,
} from "./types";
import type { PillVariant } from "@/components/ui/Pill";

// ---------- Filings ----------

export const FILING_KINDS: readonly FilingKind[] = [
  "annual_return",
  "license_renewal",
  "agent_renewal",
  "fatca",
  "crs",
  "tax_return",
  "economic_substance",
  "other",
] as const;

export const FILING_KIND_LABELS: Record<FilingKind, string> = {
  annual_return: "Annual return",
  license_renewal: "License renewal",
  agent_renewal: "Agent renewal",
  fatca: "FATCA",
  crs: "CRS",
  tax_return: "Tax return",
  economic_substance: "Economic substance",
  other: "Other",
};

export const FILING_RECURRENCES: readonly FilingRecurrence[] = [
  "none",
  "monthly",
  "quarterly",
  "annual",
  "biennial",
] as const;

export const FILING_RECURRENCE_LABELS: Record<FilingRecurrence, string> = {
  none: "One-off",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  biennial: "Biennial",
};

export function isFilingKind(s: string): s is FilingKind {
  return (FILING_KINDS as readonly string[]).includes(s);
}

export function isFilingRecurrence(s: string): s is FilingRecurrence {
  return (FILING_RECURRENCES as readonly string[]).includes(s);
}

/** Open = still needs action (overdue derives from dueDate on these). */
export function isOpenFilingStatus(status: FilingStatus): boolean {
  return status === "pending" || status === "in_progress";
}

// ---------- Dates (UTC, yyyy-mm-dd string math) ----------

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Advance a yyyy-mm-dd date by N months. A source date on the LAST day
 * of its month stays anchored to month-end (Jan 31 + 3mo → Apr 30, and
 * Apr 30 + 3mo → Jul 31, not Jul 30) so chained recurrences never drift;
 * any other day clamps to the last day of the target month.
 */
export function addMonthsIso(iso: string, months: number): string {
  const [yStr, mStr, dStr] = iso.split("-");
  const y0 = parseInt(yStr, 10);
  const m0 = parseInt(mStr, 10);
  const d0 = parseInt(dStr, 10);
  let y = y0;
  let m = m0 + months;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  const sourceLastDay = new Date(Date.UTC(y0, m0, 0)).getUTCDate();
  const targetLastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = d0 >= sourceLastDay ? targetLastDay : Math.min(d0, targetLastDay);
  const pad = (n: number, w: number) => n.toString().padStart(w, "0");
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** Months added per recurrence step. `none` returns null (no next occurrence). */
export function filingRecurrenceMonths(r: FilingRecurrence): number | null {
  switch (r) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "annual":
      return 12;
    case "biennial":
      return 24;
    case "none":
      return null;
  }
}

// ---------- KYC ----------

export const KYC_STATUSES: readonly KycStatus[] = [
  "not_started",
  "in_progress",
  "verified",
] as const;

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  verified: "Verified",
};

export const RISK_RATINGS: readonly RiskRating[] = [
  "low",
  "medium",
  "high",
] as const;

export const RISK_RATING_LABELS: Record<RiskRating, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const KYC_OUTCOMES: readonly KycReviewOutcome[] = [
  "cleared",
  "escalated",
  "refreshed",
] as const;

export const KYC_OUTCOME_LABELS: Record<KycReviewOutcome, string> = {
  cleared: "Cleared",
  escalated: "Escalated",
  refreshed: "Refreshed",
};

export function isKycStatus(s: string): s is KycStatus {
  return (KYC_STATUSES as readonly string[]).includes(s);
}

export function isRiskRating(s: string): s is RiskRating {
  return (RISK_RATINGS as readonly string[]).includes(s);
}

export function isKycOutcome(s: string): s is KycReviewOutcome {
  return (KYC_OUTCOMES as readonly string[]).includes(s);
}

/**
 * DERIVED overdue: next review date is in the past, regardless of the
 * stored status. A verified subject with a lapsed review date is overdue.
 */
export function isKycOverdue(
  kycNextReviewDate: string | null | undefined,
  today: string = todayIso(),
): boolean {
  return !!kycNextReviewDate && kycNextReviewDate < today;
}

/** Review cadence per risk rating: 12mo low, 6mo medium, 3mo high.
 *  Unrated subjects default to the low-risk (12 month) cadence. */
export function kycReviewIntervalMonths(risk: RiskRating | null | undefined): number {
  switch (risk) {
    case "high":
      return 3;
    case "medium":
      return 6;
    default:
      return 12;
  }
}

export function kycStatusVariant(status: KycStatus): PillVariant {
  switch (status) {
    case "verified":
      return "active";
    case "in_progress":
      return "pending";
    case "not_started":
      return "neutral";
  }
}

export function riskVariant(risk: RiskRating | null | undefined): PillVariant {
  switch (risk) {
    case "high":
      return "review";
    case "medium":
      return "pending";
    case "low":
      return "active";
    default:
      return "neutral";
  }
}

// ---------- Distributions ----------

export const DISTRIBUTION_STATUS_LABELS: Record<string, string> = {
  requested: "Awaiting first approval",
  first_approved: "Awaiting second approval",
  approved: "Ready to pay",
  paid: "Paid",
  rejected: "Rejected",
  void: "Void",
};

export function distributionStatusVariant(status: string): PillVariant {
  switch (status) {
    case "requested":
      return "pending";
    case "first_approved":
      return "pending";
    case "approved":
      return "formation";
    case "paid":
      return "active";
    case "rejected":
    case "void":
      return "review";
    default:
      return "neutral";
  }
}
