import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getSessionUser } from "@/lib/session";
import { logAuditEventFromHeaders } from "@/lib/audit";

const DEMO_ACCOUNTS: Array<{
  email: string;
  password: string;
  role: string;
  label: string;
  desc: string;
}> = [
  {
    email: "admin@thistlewood.com",
    password: "Admin123!",
    role: "Super admin",
    label: "Admin",
    desc: "Unrestricted across every entity, settings and approvals",
  },
  {
    email: "accountant@thistlewood.com",
    password: "Demo123!",
    role: "Accountant",
    label: "Accountant",
    desc: "Create/edit JEs, invoices and bills",
  },
  {
    email: "viewer@thistlewood.com",
    password: "Demo123!",
    role: "Viewer",
    label: "Viewer",
    desc: "Read-only across the workspace",
  },
];

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/");
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/";

  if (!email || !password) {
    redirect(`/login?error=missing&redirectTo=${encodeURIComponent(safeRedirect)}`);
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeRedirect,
    });
  } catch (err) {
    // Auth.js signIn throws NEXT_REDIRECT on success — let it propagate.
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      // Successful sign-in. Log the audit event before re-throwing the redirect.
      await logAuditEventFromHeaders({
        action: "user.login",
        userEmail: email,
        resourceType: "user",
      });
      throw err;
    }
    if (err instanceof AuthError) {
      await logAuditEventFromHeaders({
        action: "user.login_failed",
        userEmail: email,
        resourceType: "user",
        metadata: { reason: err.type },
      });
      redirect(
        `/login?error=invalid&redirectTo=${encodeURIComponent(safeRedirect)}`,
      );
    }
    throw err;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const existing = await getSessionUser();
  const params = await searchParams;
  if (existing) redirect(params.redirectTo?.startsWith("/") ? params.redirectTo : "/");

  const errored = params.error;
  const redirectTo = params.redirectTo ?? "/";

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
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  Thistlewood &amp; Associates
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 2 }}>
                  Accounting · General ledger · Reporting
                </div>
              </div>
            </div>

            <h1
              style={{
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                margin: "28px 0 4px",
              }}
            >
              Sign in
            </h1>
            <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 24px" }}>
              Demo workspace. Use one of the accounts on the right, or any other
              account your admin created for you.
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
              <li>Double-entry general ledger with role-based access</li>
              <li>Invoices, bills, customers, vendors, bank reconciliation</li>
              <li>Balance Sheet, Income Statement and Trial Balance</li>
              <li>Audit log of every change, immutable and exportable</li>
            </ul>
          </div>

          <div style={{ fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6 }}>
            Built with Next.js 15, Auth.js v5, Drizzle, and Neon Postgres.
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
              {errored === "missing"
                ? "Email and password are required."
                : "Invalid email or password."}
            </div>
          )}

          <form action={login} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  fontWeight: 500,
                }}
              >
                Email
              </span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 13,
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  fontWeight: 500,
                }}
              >
                Password
              </span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 13,
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
            </label>

            <button
              type="submit"
              style={{
                marginTop: 6,
                background: "var(--accent)",
                color: "var(--accent-fg)",
                border: "1px solid var(--accent)",
                borderRadius: 6,
                padding: "9px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sign in
            </button>
          </form>

          <div
            style={{
              marginTop: 24,
              padding: "12px 14px",
              background: "var(--rail)",
              border: "1px dashed var(--line-2)",
              borderRadius: 6,
              fontSize: 11.5,
              color: "var(--ink-3)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--ink-2)" }}>
              Demo accounts
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", lineHeight: 1.7 }}>
              {DEMO_ACCOUNTS.map((d) => (
                <li key={d.email}>
                  <code style={{ fontFamily: "var(--font-mono)" }}>{d.email}</code>
                  {" · "}
                  <code style={{ fontFamily: "var(--font-mono)" }}>{d.password}</code>
                  <span style={{ color: "var(--ink-4)" }}> — {d.desc}</span>
                </li>
              ))}
            </ul>
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
