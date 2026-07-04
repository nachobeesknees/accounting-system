/**
 * Dashboard widget registry — shared by the dashboard page (visibility)
 * and the Customize panel (labels). Keys persist in users.dashboard_prefs
 * as { hidden: string[] }, so renaming a key orphans saved prefs.
 */
export const DASHBOARD_WIDGETS = [
  { key: "quickActions", label: "Quick actions" },
  { key: "recurringDue", label: "Recurring entries due" },
  { key: "approvalsInbox", label: "Approvals inbox (all types)" },
  { key: "awaitingApproval", label: "Awaiting your approval" },
  { key: "bizKpis", label: "Business KPIs (ARR, fees, attendances, clients)" },
  { key: "ledgerKpis", label: "AUA / Net income / Cash tiles" },
  { key: "firmPl", label: "Per firm entity P&L" },
  { key: "agings", label: "AR / AP aging" },
  { key: "periodStatus", label: "Period status" },
  { key: "activity", label: "Recent journal entries & upcoming bills" },
  { key: "overdueInvoices", label: "Overdue invoices" },
  { key: "filingsDue", label: "Filings due" },
] as const;

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGETS)[number]["key"];

export type DashboardPrefs = { hidden: string[] };

export const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = { hidden: [] };
