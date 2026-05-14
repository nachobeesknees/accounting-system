import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { getSessionUser } from "@/lib/session";
import { hasPermission, ROLE_OPTIONS, roleLabel } from "@/lib/permissions";
import { listUsers } from "@/lib/user-mutations";
import { getEntities } from "@/lib/data";
import { listUserEntityAccess } from "@/lib/access";
import {
  createUserAction,
  resetPasswordAction,
  setEntityAccessAction,
  toggleActiveAction,
  updateRoleAction,
} from "./actions";

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    created?: string;
    reset?: string;
    access?: string;
  }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!hasPermission(me, "user.manage")) {
    return (
      <>
        <PageHeader title="Users" />
        <div className="px-6 py-6 text-[13px]" style={{ color: "var(--ink-3)" }}>
          You don&rsquo;t have permission to manage users. Ask a super admin to
          grant you access.
        </div>
      </>
    );
  }

  const params = await searchParams;
  const users = await listUsers();
  const entities = await getEntities();
  const resetTuple = params.reset ? params.reset.split(":") : null;
  const resetUserId = resetTuple?.[0] ?? null;
  const resetPassword = resetTuple?.[1] ?? null;
  const accessUserId = params.access ?? null;
  const accessRows = accessUserId
    ? await listUserEntityAccess(accessUserId)
    : [];
  const accessSelectedIds = new Set(accessRows.map((r) => r.entityId));
  const accessReadOnly = new Set(
    accessRows.filter((r) => r.accessLevel === "read_only").map((r) => r.entityId),
  );

  return (
    <>
      <PageHeader
        title="Users"
        meta={`${users.length} ${users.length === 1 ? "user" : "users"}`}
      />

      <div className="px-6 py-3.5 flex flex-col gap-3.5">
        {params.error && (
          <div
            className="px-3 py-2 rounded text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
            }}
          >
            {decodeURIComponent(params.error)}
          </div>
        )}
        {params.created && (
          <div
            className="px-3 py-2 rounded text-[12.5px]"
            style={{
              background: "var(--p-active-bg)",
              color: "var(--p-active-fg)",
            }}
          >
            User created.
          </div>
        )}
        {resetUserId && resetPassword && (
          <div
            className="px-3 py-2 rounded text-[12.5px]"
            style={{
              background: "var(--p-formation-bg)",
              color: "var(--p-formation-fg)",
            }}
          >
            <div style={{ fontWeight: 600 }}>Temporary password generated.</div>
            <div style={{ marginTop: 4 }}>
              Share this with the user — it&rsquo;s shown only once and will not
              be retrievable after this page reloads.
            </div>
            <code
              style={{
                display: "inline-block",
                marginTop: 6,
                padding: "4px 8px",
                background: "var(--paper)",
                borderRadius: 4,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
              }}
            >
              {resetPassword}
            </code>
          </div>
        )}

        <Card title="Add user">
          <form
            action={createUserAction}
            className="p-3.5 grid"
            style={{
              gridTemplateColumns: "1.4fr 1.4fr 1fr 1fr auto",
              gap: 10,
              alignItems: "end",
            }}
          >
            <label className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Email
              </span>
              <input
                name="email"
                type="email"
                required
                placeholder="user@example.com"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Full name
              </span>
              <input
                name="fullName"
                required
                placeholder="Jane Doe"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Role
              </span>
              <select
                name="role"
                defaultValue="viewer"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Initial password
              </span>
              <input
                name="password"
                type="text"
                required
                minLength={8}
                placeholder="At least 8 chars"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 5,
                  padding: "6px 8px",
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                }}
              />
            </label>
            <button
              type="submit"
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
                border: "1px solid var(--accent)",
                borderRadius: 5,
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                height: 32,
              }}
            >
              Add user
            </button>
          </form>
        </Card>

        <Card title="All users">
          <Table>
            <THead>
              <TR hover={false}>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Last login</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD>{u.fullName}</TD>
                  <TD mono>{u.email}</TD>
                  <TD>
                    <form
                      action={updateRoleAction}
                      style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
                    >
                      <input type="hidden" name="userId" value={u.id} />
                      <select
                        name="role"
                        defaultValue={u.role}
                        style={{
                          background: "var(--paper)",
                          border: "1px solid var(--line-2)",
                          borderRadius: 4,
                          padding: "3px 6px",
                          fontSize: 12,
                        }}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        style={{
                          fontSize: 11.5,
                          padding: "3px 8px",
                          background: "var(--paper)",
                          border: "1px solid var(--line-2)",
                          borderRadius: 4,
                          cursor: "pointer",
                          color: "var(--ink-2)",
                        }}
                      >
                        Save
                      </button>
                    </form>
                  </TD>
                  <TD>
                    {u.isActive ? (
                      <Pill variant="active">Active</Pill>
                    ) : (
                      <Pill variant="neutral">Inactive</Pill>
                    )}
                  </TD>
                  <TD>{formatDate(u.lastLoginAt)}</TD>
                  <TD>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <form action={toggleActiveAction} style={{ display: "inline" }}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={u.isActive ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          style={{
                            fontSize: 11.5,
                            padding: "3px 8px",
                            background: "var(--paper)",
                            border: "1px solid var(--line-2)",
                            borderRadius: 4,
                            cursor: "pointer",
                            color: "var(--ink-2)",
                          }}
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                      <form action={resetPasswordAction} style={{ display: "inline" }}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button
                          type="submit"
                          style={{
                            fontSize: 11.5,
                            padding: "3px 8px",
                            background: "var(--paper)",
                            border: "1px solid var(--line-2)",
                            borderRadius: 4,
                            cursor: "pointer",
                            color: "var(--ink-2)",
                          }}
                        >
                          Reset password
                        </button>
                      </form>
                      <a
                        href={`/settings/users?access=${u.id}`}
                        style={{
                          fontSize: 11.5,
                          padding: "3px 8px",
                          background: "var(--paper)",
                          border: "1px solid var(--line-2)",
                          borderRadius: 4,
                          cursor: "pointer",
                          color: "var(--ink-2)",
                          textDecoration: "none",
                        }}
                      >
                        Entity access
                      </a>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        {accessUserId && (
          <Card title={`Entity access — ${users.find((u) => u.id === accessUserId)?.email ?? accessUserId}`}>
            <form action={setEntityAccessAction} className="p-3.5 flex flex-col gap-3">
              <input type="hidden" name="userId" value={accessUserId} />
              <div className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                Tick entities to restrict this user to that subset. With no
                entities selected, the user sees all entities (the admin default).
                Use read-only to allow viewing without write access.
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 6,
                  fontSize: 12.5,
                  maxHeight: 360,
                  overflowY: "auto",
                  padding: "8px 0",
                }}
              >
                {entities.map((e) => {
                  const checked = accessSelectedIds.has(e.id);
                  const readonly = accessReadOnly.has(e.id);
                  return (
                    <div
                      key={e.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid var(--line)",
                        background: "var(--paper)",
                      }}
                    >
                      <label style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                        <input
                          type="checkbox"
                          name="entityIds"
                          value={e.id}
                          defaultChecked={checked}
                        />
                        <span>{e.name}</span>
                        <span style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
                          {e.code}
                        </span>
                      </label>
                      <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11 }}>
                        <input
                          type="checkbox"
                          name="readOnly"
                          value={e.id}
                          defaultChecked={readonly}
                        />
                        Read-only
                      </label>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-fg)",
                    border: "1px solid var(--accent)",
                    borderRadius: 5,
                    padding: "7px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Save entity access
                </button>
                <a
                  href="/settings/users"
                  style={{
                    padding: "7px 14px",
                    fontSize: 13,
                    color: "var(--ink-2)",
                    background: "var(--paper)",
                    border: "1px solid var(--line-2)",
                    borderRadius: 5,
                    textDecoration: "none",
                  }}
                >
                  Cancel
                </a>
              </div>
            </form>
          </Card>
        )}

        <Card title="Role legend">
          <div className="p-3.5 grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, fontSize: 12 }}>
            {ROLE_OPTIONS.map((r) => (
              <div key={r.value} style={{ color: "var(--ink-2)" }}>
                <strong>{roleLabel(r.value)}:</strong>{" "}
                {r.value === "super_admin" && "Unrestricted, including period unlock."}
                {r.value === "admin" && "Everything except period unlock."}
                {r.value === "manager" && "Approvals + reports, no settings."}
                {r.value === "accountant" && "Create/edit JEs, invoices, bills."}
                {r.value === "viewer" && "Read-only across workspace."}
                {r.value === "employee" && "Read-only on assigned clients only."}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
