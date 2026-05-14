import type { Account } from "./types";

/**
 * "Controlled" accounts — AR, AP, and cash/bank — are normally driven by
 * invoices, bills, or bank transactions rather than direct journal entries.
 * A direct posting isn't blocked, but the form surfaces a soft warning and
 * stamps `bypassControlWarning=true` on the entry so the audit log captures
 * intent.
 *
 * Detection is three-pronged so we catch well-typed accounts, the
 * conventional-code charts that don't bother setting subType, and the
 * charts whose names explicitly say "Accounts Receivable" / "Cash" even
 * if the code falls outside the typical range:
 *   - account.subType hints — "accounts_receivable", "accounts_payable",
 *     "bank", "cash"
 *   - account.code ranges — 1000-1099 cash, 1100-1199 AR, 2000-2099 AP
 *   - account.name match — "cash", "bank", "accounts receivable",
 *     "accounts payable" (case-insensitive)
 *
 * Returns "ar" | "ap" | "cash" when the account is controlled, null otherwise.
 */
export type AccountControlClass = "ar" | "ap" | "cash";

export function getAccountControlClass(
  account: Pick<Account, "code" | "subType" | "accountType"> & {
    name?: string;
  },
): AccountControlClass | null {
  const sub = (account.subType ?? "").toLowerCase();
  if (sub === "accounts_receivable" || sub === "ar") return "ar";
  if (sub === "accounts_payable" || sub === "ap") return "ap";
  if (sub === "bank" || sub === "cash") return "cash";

  const codeStr = (account.code ?? "").trim();
  // Match only the leading numeric portion (e.g. "1100-A" → 1100).
  const leading = codeStr.match(/^\d+/);
  if (leading) {
    const code = parseInt(leading[0], 10);
    if (!Number.isNaN(code)) {
      if (code >= 1000 && code <= 1099) return "cash";
      if (code >= 1100 && code <= 1199) return "ar";
      if (code >= 2000 && code <= 2099) return "ap";
    }
  }

  const name = (account.name ?? "").toLowerCase();
  if (name.includes("accounts receivable") || /\bar\b/.test(name)) return "ar";
  if (name.includes("accounts payable") || /\bap\b/.test(name)) return "ap";
  if (
    name.startsWith("cash") ||
    name.startsWith("bank") ||
    name.includes(" cash") ||
    name.includes(" bank")
  ) {
    return "cash";
  }

  return null;
}

export function controlClassLabel(c: AccountControlClass): string {
  if (c === "ar") return "AR";
  if (c === "ap") return "AP";
  return "Cash";
}

export function controlWarningInline(c: AccountControlClass): string {
  if (c === "ar") return "⚠ Direct posting to AR — normally updated via invoices";
  if (c === "ap") return "⚠ Direct posting to AP — normally updated via bills";
  return "⚠ Direct posting to Cash — normally updated via bank transactions";
}
