import { redirect } from "next/navigation";
import { authenticate, getSessionUser, setSession } from "@/lib/session";
import { getUsers } from "@/lib/data";

const ROLE_ICON: Record<string, string> = {
  Admin: "👤",
  Bookkeeper: "📒",
  Controller: "🧮",
  CFO: "🗂",
};

const ROLE_DESC: Record<string, string> = {
  Admin: "Full access to all entities and operations",
  Bookkeeper: "Create and post journal entries, view GL",
  Controller: "Setup, approval, period locks",
  CFO: "Reports, consolidation, approval authority",
};

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = authenticate(email, password);
  if (!user) {
    redirect("/login?error=1");
  }
  await setSession(user.userId);
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const existing = await getSessionUser();
  if (existing) redirect("/");
  const params = await searchParams;
  const users = getUsers();
  const errored = params.error === "1";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--paper)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          maxWidth: 980,
          width: "100%",
          minHeight: 560,
          border: "1px solid var(--line)",
          background: "var(--raised)",
          borderRadius: 12,
          overflow: "hidden",
        }}
        className="login-shell"
      >
        <div
          style={{
            padding: "36px 40px",
            background: "var(--rail)",
            borderRight: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: "var(--accent)",
                  color: "var(--accent-fg)",
                  fontWeight: 700,
                  fontSize: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                T
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Thistlewood &amp; Associates</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 2 }}>
                  Accounting · General ledger · Reporting
                </div>
              </div>
            </div>

            <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", margin: "28px 0 4px" }}>
              Sign in to your demo workspace
            </h1>
            <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 24px" }}>
              No password required &mdash; pick a role on the right to enter the workspace with the corresponding permissions.
            </p>

            <ul
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                fontSize: 12.5,
                color: "var(--ink-2)",
                margin: 0,
                paddingLeft: 16,
              }}
            >
              <li>Double-entry general ledger with posted and draft entries</li>
              <li>Invoices, bills, customers, vendors, bank reconciliation</li>
              <li>Balance Sheet, Income Statement and Trial Balance</li>
              <li>Light + dark theme &middot; keyboard-friendly tables</li>
            </ul>
          </div>

          <div style={{ fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6 }}>
            Built with Next.js 15, Drizzle, Neon Postgres and Tailwind CSS v4.
          </div>
        </div>

        <div
          style={{
            padding: "36px 40px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
          }}
        >
          {errored && (
            <div
              style={{
                marginBottom: 16,
                padding: "8px 12px",
                borderRadius: 6,
                background: "var(--p-review-bg)",
                color: "var(--p-review-fg)",
                fontSize: 12.5,
              }}
            >
              Login failed. Try a different account or click one below.
            </div>
          )}

          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 4px" }}>
            Choose an account
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 24px" }}>
            One-click sign in &mdash; every account uses password{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>demo123</code>.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {users.map((u) => (
              <form key={u.id} action={login}>
                <input type="hidden" name="email" value={u.email} />
                <input type="hidden" name="password" value="demo123" />
                <button
                  type="submit"
                  className="login-card"
                  style={{
                    width: "100%",
                    border: "1px solid var(--line-2)",
                    background: "var(--paper)",
                    borderRadius: 8,
                    padding: "12px 14px",
                    textAlign: "left",
                    color: "var(--ink)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    font: "inherit",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{ROLE_ICON[u.role] ?? "👤"}</span>
                  <span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--ink-4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        display: "block",
                      }}
                    >
                      {u.role}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, display: "block" }}>
                      {u.fullName}
                    </span>
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.45 }}>
                    {ROLE_DESC[u.role] ?? ""}
                  </span>
                </button>
              </form>
            ))}
          </div>

          <div
            style={{
              marginTop: 18,
              padding: "10px 12px",
              background: "var(--rail)",
              border: "1px dashed var(--line-2)",
              borderRadius: 6,
              fontSize: 11.5,
              color: "var(--ink-3)",
            }}
          >
            Demo workspace &middot; Data is illustrative. Some records reset per server cold-start.
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .login-shell { grid-template-columns: 1fr !important; min-height: 0 !important; }
        }
      `}</style>
    </div>
  );
}
