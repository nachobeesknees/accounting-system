import { createHash } from "node:crypto";

export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    raw.includes("://")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(raw, "https://wyzird.internal");
    if (parsed.origin !== "https://wyzird.internal") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export function redirectPathWithParams(
  path: string,
  params: Record<string, string>,
): string {
  const safe = safeRedirectPath(path);
  const parsed = new URL(safe, "https://wyzird.internal");
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function isDemoLoginEnabled(): boolean {
  if (process.env.ENABLE_DEMO_LOGIN === "true") return true;
  if (process.env.ENABLE_DEMO_LOGIN === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * The three canonical demo accounts (seeded by scripts/seed-security-users.ts).
 * When demo login is enabled these sign in with one click — no password
 * check — so the demo picker never depends on env↔DB password sync.
 */
const DEMO_LOGIN_EMAILS = new Set([
  "admin@thistlewood.com",
  "accountant@thistlewood.com",
  "viewer@thistlewood.com",
]);

export function isDemoLoginEmail(email: string): boolean {
  return DEMO_LOGIN_EMAILS.has(email.trim().toLowerCase());
}

const KNOWN_DEMO_CREDENTIAL_HASHES = new Set([
  "eeef711e1f6cba830571b2cc45ba4256e25d0c867c29d5f1ad1e74b33468fc22",
  "1f9a79cf419a6ccc3db845b2b22963f5bc2d5748470307dfd44eb556460c8adf",
  "68689d67004e382b14d4edc56848911db75dd2bf425374fa17d7b84b306c6890",
]);

export function isKnownDemoCredential(email: string, password: string): boolean {
  const fingerprint = createHash("sha256")
    .update(`${email.trim().toLowerCase()}\0${password}`)
    .digest("hex");
  return KNOWN_DEMO_CREDENTIAL_HASHES.has(fingerprint);
}

export function canUseLegacyDemoPassword(): boolean {
  return (
    isDemoLoginEnabled() || process.env.ALLOW_LEGACY_DEMO_PASSWORDS === "true"
  );
}
