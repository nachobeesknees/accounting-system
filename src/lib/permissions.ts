/**
 * RBAC matrix. Each role maps to a set of permitted actions. The action
 * vocabulary is coarse-grained ("invoice.create", "period.unlock") and
 * shared across the server (server actions) and the client UI (hiding
 * unauthorized buttons).
 *
 * Roles:
 *   super_admin — unrestricted, including unlocking locked periods
 *   admin       — everything except unlocking locked periods
 *   manager     — approve invoices/bills + view reports; no settings
 *   accountant  — create/edit JEs/invoices/bills; no approvals
 *   viewer      — read-only everywhere
 *   employee    — read-only on their assigned clients/invoices only
 *
 * `isSuperuser=true` on a user record always trumps the role and grants
 * every action. This is the legacy escape hatch from the old session
 * model; the canonical way going forward is `role === "super_admin"`.
 */

import type { SessionUser } from "./types";

export type Role =
  | "super_admin"
  | "admin"
  | "manager"
  | "accountant"
  | "viewer"
  | "employee";

const ROLES: readonly Role[] = [
  "super_admin",
  "admin",
  "manager",
  "accountant",
  "viewer",
  "employee",
] as const;

export function isRole(s: string | null | undefined): s is Role {
  return typeof s === "string" && (ROLES as readonly string[]).includes(s);
}

/**
 * Every action enforced anywhere in the app. Adding a new sensitive
 * server action? Pick (or add) an action name and gate it via
 * `requirePermission`.
 */
export type Action =
  // Reading — everyone except a fully-restricted employee can do these
  | "read.dashboard"
  | "read.reports"
  | "read.settings"
  | "read.audit_log"
  | "read.users"
  // Journal
  | "journal_entry.create"
  | "journal_entry.update"
  | "journal_entry.post"
  | "journal_entry.void"
  | "journal_entry.bypass_control"
  // Invoices / bills
  | "invoice.create"
  | "invoice.update"
  | "invoice.approve"
  | "invoice.void"
  | "bill.create"
  | "bill.update"
  | "bill.approve"
  | "bill.void"
  // Vendor approval workflow — OCR auto-creates land pending and need a
  // manager-or-higher to approve before bills against them can be posted.
  | "vendor.approve"
  // Banking
  | "bank.reconcile"
  | "bank.create_transaction"
  // Periods
  | "period.close"
  | "period.lock"
  | "period.unlock"
  | "period.reopen"
  // Settings
  | "settings.write"
  | "user.create"
  | "user.update"
  | "user.reset_password"
  | "user.deactivate"
  | "user.assign_access"
  // Exports
  | "report.export_csv"
  | "audit.export_csv"
  // Eliminations / intercompany
  | "intercompany.generate_elimination";

const READ_ALL: Action[] = [
  "read.dashboard",
  "read.reports",
  "read.users",
];

const WRITE_BOOKS: Action[] = [
  "journal_entry.create",
  "journal_entry.update",
  "journal_entry.post",
  "journal_entry.void",
  "invoice.create",
  "invoice.update",
  "bill.create",
  "bill.update",
  "bank.create_transaction",
  "report.export_csv",
];

const APPROVALS: Action[] = [
  "invoice.approve",
  "bill.approve",
  "vendor.approve",
];

const ADMIN_ACTIONS: Action[] = [
  "read.settings",
  "settings.write",
  "user.create",
  "user.update",
  "user.reset_password",
  "user.deactivate",
  "user.assign_access",
  "period.close",
  "period.lock",
  "period.reopen",
  "intercompany.generate_elimination",
  "invoice.void",
  "bill.void",
  "bank.reconcile",
  "journal_entry.bypass_control",
  "read.audit_log",
  "audit.export_csv",
];

const SUPER_ONLY: Action[] = ["period.unlock"];

const ROLE_MATRIX: Record<Role, ReadonlyArray<Action>> = {
  super_admin: [
    ...READ_ALL,
    ...WRITE_BOOKS,
    ...APPROVALS,
    ...ADMIN_ACTIONS,
    ...SUPER_ONLY,
  ],
  admin: [...READ_ALL, ...WRITE_BOOKS, ...APPROVALS, ...ADMIN_ACTIONS],
  manager: [...READ_ALL, ...APPROVALS, "report.export_csv"],
  accountant: [...READ_ALL, ...WRITE_BOOKS],
  viewer: [...READ_ALL],
  employee: ["read.dashboard"],
};

/**
 * Returns true if the given session is allowed to perform `action`.
 * Falls back to `isSuperuser=true` (the legacy override) when the role
 * isn't recognised.
 */
export function hasPermission(
  session: SessionUser | null | undefined,
  action: Action,
): boolean {
  if (!session) return false;
  if (session.isSuperuser) return true;
  if (!isRole(session.role)) return false;
  return ROLE_MATRIX[session.role].includes(action);
}

/**
 * Throws a PermissionError when the session can't perform `action`.
 * Wrap sensitive server actions with this — the error bubbles up to
 * Next.js as a 500, but UI buttons should already be hidden via
 * `hasPermission` so this is a defense-in-depth check.
 */
export class PermissionError extends Error {
  readonly action: Action;
  constructor(action: Action, message?: string) {
    super(message ?? `Permission denied: ${action}`);
    this.name = "PermissionError";
    this.action = action;
  }
}

export function requirePermission(
  session: SessionUser | null | undefined,
  action: Action,
): asserts session is SessionUser {
  if (!session) throw new PermissionError(action, "Not authenticated");
  if (!hasPermission(session, action)) throw new PermissionError(action);
}

/**
 * Human-readable label for a role. Used in UI badges + the user list.
 */
export function roleLabel(role: string): string {
  if (!isRole(role)) return role;
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    case "accountant":
      return "Accountant";
    case "viewer":
      return "Viewer";
    case "employee":
      return "Employee";
  }
}

export const ALL_ROLES: readonly Role[] = ROLES;
