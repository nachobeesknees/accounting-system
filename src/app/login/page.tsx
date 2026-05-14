/**
 * Demo login page. While the workspace is pre-production we keep one-click
 * buttons per role so reviewers can switch personas without typing
 * credentials. Each button submits the underlying email+password to the
 * same `login` server action the production form uses, so the Auth.js
 * session + audit log behave identically.
 */
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getSessionUser } from "@/lib/session";
import { logAuditEventFromHeaders } from "@/lib/audit";

type DemoAccount = {
  email: string;
  password: string;
  role: string;
  label: string;
  desc: string;
  /** Avatar initial + color group. */
  initial: string;
  paletteVar: string;
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "admin@thistlewood.com",
    password: "Admin123!",
    role: "Super admin",
    label: "Demo Admin",
    desc: "Full access — every entity, every report, every approval",
    initial: "A",
    paletteVar: "--p-formation-bg",
  },
  {
    email: "accountant@thistlewood.com",
    password: "Demo123!",
    role: "Accountant",
    label: "Demo Accountant",
    desc: "Create and edit JEs, invoices, bills",
    initial: "B",
    paletteVar: "--p-active-bg",
  },
  {
    email: "viewer@thistlewood.com",
    password: "Demo123!",
    role: "Viewer",
    label: "Demo Viewer",
    desc: "Read-only across the workspace",
    initial: "V",
    paletteVar: "--p-pending-bg",
  },
];

/**
 * Shared server action. Reads email/password from the submitted form
 * (each demo button populates them via hidden inputs) so we can keep
 * one signIn implementation rather than three near-identical ones.
 */
async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/");
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/";

  if (!email || !password) {
    redirect(
      `/login?error=missing&redirectTo=${encodeURIComponent(safeRedirect)}`,
    );
  }

  try {
    await signIn("credentials", { email, password, redirectTo: safeRedirect });
  } catch (err) {
    // Auth.js's signIn throws a NEXT_REDIRECT on success — propagate it so
    // Next.js performs the navigation. Log a successful audit event first.
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
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
  if (existing) {
    redirect(
      params.redirectTo?.startsWith("/") ? params.redirectTo : "/",
    );
  }

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
          maxWidth: 720,
          width: "100%",
          border: "1px solid var(--line)",
          background: "var(--raised)",
          borderRadius: 12,
          padding: "32px 32px 28px",
        }}
      >
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
            <div
              style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 2 }}
            >
              Accounting · General ledger · Reporting
            </div>
          </div>
        </div>

        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            margin: "24px 0 4px",
          }}
        >
          Sign in to your demo workspace
        </h1>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--ink-3)",
            margin: "0 0 20px",
          }}
        >
          No password required — pick a role to enter the workspace with the
          matching permissions. The real email/password form returns when we
          go to production.
        </p>

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
              ? "Demo account is misconfigured — please contact the admin."
              : "Could not sign in with that demo account."}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {DEMO_ACCOUNTS.map((d) => (
            <form key={d.email} action={login}>
              <input type="hidden" name="email" value={d.email} />
              <input type="hidden" name="password" value={d.password} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <button
                type="submit"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "var(--paper)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "inherit",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: 14,
                    background: `var(${d.paletteVar})`,
                    color: "var(--ink)",
                    flexShrink: 0,
                  }}
                >
                  {d.initial}
                </span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 10.5,
                        color: "var(--ink-3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginRight: 8,
                      }}
                    >
                      {d.role}
                    </span>
                    {d.label}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--ink-3)",
                      marginTop: 2,
                    }}
                  >
                    {d.desc}
                  </span>
                </span>
              </button>
            </form>
          ))}
        </div>

        <details
          style={{
            marginTop: 18,
            fontSize: 11.5,
            color: "var(--ink-3)",
            lineHeight: 1.6,
          }}
        >
          <summary style={{ cursor: "pointer", color: "var(--ink-2)" }}>
            Use a specific email + password instead
          </summary>
          <form
            action={login}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 12,
            }}
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
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
            <input
              type="password"
              name="password"
              placeholder="Password"
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
            <button
              type="submit"
              style={{
                marginTop: 2,
                background: "var(--accent)",
                color: "var(--accent-fg)",
                border: "1px solid var(--accent)",
                borderRadius: 6,
                padding: "9px 14px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sign in
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}
