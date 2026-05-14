/**
 * Role-based permission matrix. The `Role` → `Action` table here is the
 * single source of truth for what each role can do. UI code (sidebar,
 * page bodies, button gating) and server actions both call
 * `hasPermission(session, action)` so the surface stays consistent.
 *
 * Roles
 *   super_admin — unrestricted, including unlocking locked periods.
 *   admin       — everything except `period.unlock`.
 *   manager     — read everything, approve invoices/bills, but no
 *                 settings, no period close/lock, no user admin.
 *   accountant  — create/edit JEs/invoices/bills/payments; no approvals,
 *                 no settings, no user admin.
 *   viewer      — read-only everywhere, no writes.
 *   employee    — read-only on their own clients only (see
 *                 `user_client_access`). Cannot see admin/settings pages.
 *
 * Adding a new action: append it to `Action`, then set its row in
 * `MATRIX`. Server actions should call `requirePermission(session, …)`
 * so an unprivileged caller hits an early 403-style throw instead of
 * silently running.
 */

import "server-only";

import type { SessionUser } from "./types";

export type Role =
  | "super_admin"
  | "admin"
  | "manager"
  | "accountant"
  | "viewer"
  | "employee";

export type Action =
  // Journal entries
  | "journal.create"
  | "journal.update"
  | "journal.post"
  | "journal.void"
  | "journal.delete"
  | "journal.bypass_control"
  // Invoices / AR
  | "invoice.create"
  | "invoice.update"
  | "invoice.approve"
  | "invoice.delete"
  | "invoice.send"
  // Bills / AP
  | "bill.create"
  | "bill.update"
  | "bill.approve"
  | "bill.delete"
  | "bill.pay"
  // Payments
  | "payment.create"
  | "payment.delete"
  // Reference data
  | "entity.manage"
  | "customer.manage"
  | "vendor.manage"
  | "contact.manage"
  | "asset.manage"
  | "bank_account.manage"
  | "account.manage"
  | "price_list.manage"
  | "fee_schedule.manage"
  | "lookup.manage"
  | "custom_field.manage"
  | "dimension.manage"
  | "currency.manage"
  | "region.manage"
  | "time.create"
  | "time.update"
  | "time.delete"
  // Periods
  | "period.close"
  | "period.lock"
  | "period.reopen"
  | "period.unlock"
  | "period.override"
  // Reports / exports
  | "report.view"
  | "report.export"
  | "consolidated.view"
  // Security / admin
  | "user.manage"
  | "audit.view"
  | "audit.export"
  | "settings.manage";

const ALL: Action[] = [
  "journal.create",
  "journal.update",
  "journal.post",
  "journal.void",
  "journal.delete",
  "journal.bypass_control",
  "invoice.create",
  "invoice.update",
  "invoice.approve",
  "invoice.delete",
  "invoice.send",
  "bill.create",
  "bill.update",
  "bill.approve",
  "bill.delete",
  "bill.pay",
  "payment.create",
  "payment.delete",
  "entity.manage",
  "customer.manage",
  "vendor.manage",
  "contact.manage",
  "asset.manage",
  "bank_account.manage",
  "account.manage",
  "price_list.manage",
  "fee_schedule.manage",
  "lookup.manage",
  "custom_field.manage",
  "dimension.manage",
  "currency.manage",
  "region.manage",
  "time.create",
  "time.update",
  "time.delete",
  "period.close",
  "period.lock",
  "period.reopen",
  "period.unlock",
  "period.override",
  "report.view",
  "report.export",
  "consolidated.view",
  "user.manage",
  "audit.view",
  "audit.export",
  "settings.manage",
];

function setOf(actions: Action[]): Set<Action> {
  return new Set(actions);
}

const SUPER_ADMIN = setOf(ALL);

// Admin: everything except unlocking locked periods.
const ADMIN = setOf(ALL.filter((a) => a !== "period.unlock"));

// Manager: read everything, approve invoices/bills, but no settings or
// user admin, and cannot close/lock/reopen periods.
const MANAGER = setOf([
  "journal.create",
  "journal.update",
  "journal.post",
  "journal.void",
  "invoice.create",
  "invoice.update",
  "invoice.approve",
  "invoice.send",
  "bill.create",
  "bill.update",
  "bill.approve",
  "bill.pay",
  "payment.create",
  "time.create",
  "time.update",
  "time.delete",
  "report.view",
  "report.export",
  "consolidated.view",
  "audit.view",
]);

// Accountant: data-entry powers. Can create/edit JEs/invoices/bills/
// payments, but cannot approve or touch settings.
const ACCOUNTANT = setOf([
  "journal.create",
  "journal.update",
  "journal.post",
  "journal.void",
  "invoice.create",
  "invoice.update",
  "invoice.send",
  "bill.create",
  "bill.update",
  "bill.pay",
  "payment.create",
  "time.create",
  "time.update",
  "time.delete",
  "report.view",
  "report.export",
  "consolidated.view",
]);

// Viewer: read-only across the workspace.
const VIEWER = setOf([
  "report.view",
  "consolidated.view",
]);

// Employee: read-only on their own clients only. Sees reports for the
// clients they're assigned to. Doesn't see admin/settings.
const EMPLOYEE = setOf([
  "report.view",
  "time.create",
  "time.update",
]);

const MATRIX: Record<Role, Set<Action>> = {
  super_admin: SUPER_ADMIN,
  admin: ADMIN,
  manager: MANAGER,
  accountant: ACCOUNTANT,
  viewer: VIEWER,
  employee: EMPLOYEE,
};

function asRole(role: string | undefined | null): Role {
  if (role === "super_admin" || role === "admin" || role === "manager" ||
      role === "accountant" || role === "viewer" || role === "employee") {
    return role;
  }
  return "viewer";
}

/**
 * Pure check. Returns true if the session's role can perform the action.
 * `isSuperuser=true` shorts to true regardless of role. Anonymous (null)
 * sessions never have permission.
 */
export function hasPermission(
  session: SessionUser | null | undefined,
  action: Action,
): boolean {
  if (!session) return false;
  if (session.isSuperuser) return true;
  const role = asRole(session.role);
  return MATRIX[role].has(action);
}

/**
 * Throws if the session can't perform `action`. Use at the top of server
 * actions and route handlers that mutate.
 *
 * The error message includes the role + action so it's debuggable from a
 * stack trace, but the response surfaced to the user is "Not authorized".
 */
export function requirePermission(
  session: SessionUser | null | undefined,
  action: Action,
): asserts session is SessionUser {
  if (!hasPermission(session, action)) {
    const role = session ? asRole(session.role) : "anonymous";
    throw new Error(`Not authorized: role "${role}" cannot ${action}`);
  }
}

/** All actions a session can perform. Useful for client-side UI gates. */
export function permissionsFor(
  session: SessionUser | null | undefined,
): Action[] {
  if (!session) return [];
  if (session.isSuperuser) return [...ALL];
  return [...MATRIX[asRole(session.role)]];
}

/** Human-readable label for a role. */
export function roleLabel(role: string): string {
  switch (asRole(role)) {
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

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "super_admin", label: "Super admin" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "viewer", label: "Viewer" },
  { value: "employee", label: "Employee" },
];
