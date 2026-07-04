/**
 * Per-type adapters for the CSV import/export pipeline. Each adapter
 * declares its columns, an example row used in the downloadable
 * template, a serializer (current rows → CSV record), and an importer
 * (parsed CSV row → validation result + insert).
 *
 * Adding a new type:
 *   1. Define ADAPTERS[type] with columns + example + load + insert.
 *   2. Optionally add it to TYPE_OPTIONS in the settings page.
 */

import "server-only";

import {
  getAssets,
  getContacts,
  getCustomers,
  getEntities,
  getTimeEntries,
  getVendors,
} from "@/lib/data";
import {
  createAsset,
  createContact,
  createCustomer,
  createEntity,
  createTimeEntry,
  createVendor,
} from "@/lib/mutations";
import { parseCsv } from "@/lib/csv";
import { parseAmount } from "@/lib/money";
import type { SessionUser } from "@/lib/types";

export type CsvTypeKey =
  | "contacts"
  | "entities"
  | "customers"
  | "vendors"
  | "assets"
  | "time_entries";

export type CsvColumn = {
  name: string;
  required?: boolean;
  description: string;
};

export type ImportResult = { ok: true } | { ok: false; error: string };

export type CsvAdapter = {
  key: CsvTypeKey;
  label: string;
  description: string;
  columns: CsvColumn[];
  /** Example row used to populate the downloadable template. */
  example: Record<string, string>;
  /** Returns the current dataset as CSV rows (in column order). */
  load(): Promise<Record<string, string>[]>;
  /** Validates + inserts a parsed CSV row. */
  insert(user: SessionUser, row: Record<string, string>): Promise<ImportResult>;
};

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

// --------- Bank statement CSV (per-account import at /bank/[id]/import) ---------
//
// Bank exports don't share a schema, so this adapter does flexible header
// matching instead of the fixed-column contract the ADAPTERS above use.
// Accepted shapes (headers case/spacing-insensitive):
//   - Date / Description / Amount [/ Reference]
//   - Date / Description / Debit / Credit [/ Reference]
// Sign convention matches bank_transactions everywhere in the app:
// deposits positive, outflows negative (amount = credit − debit).

export type BankStatementRow = {
  /** Normalized YYYY-MM-DD. */
  transactionDate: string;
  description: string;
  /** Deposits positive, outflows negative. */
  amount: number;
  reference: string | null;
};

export type BankStatementParseResult = {
  rows: BankStatementRow[];
  /** Per-row problems ("Row 3: unparseable date …"). Bad rows are skipped. */
  errors: string[];
  /** Set when the file is unusable as a whole (missing headers, empty). */
  headerError: string | null;
};

/** Normalize a header for matching: lowercase, strip non-alphanumerics. */
function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const DATE_HEADERS = ["date", "transactiondate", "posteddate", "postingdate", "valuedate", "bookingdate"];
const DESC_HEADERS = ["description", "memo", "details", "narrative", "transactiondescription", "payee", "name"];
const AMOUNT_HEADERS = ["amount", "transactionamount", "value"];
const DEBIT_HEADERS = ["debit", "debitamount", "withdrawal", "withdrawals", "moneyout", "paidout"];
const CREDIT_HEADERS = ["credit", "creditamount", "deposit", "deposits", "moneyin", "paidin"];
const REF_HEADERS = ["reference", "ref", "referencenumber", "checknumber", "chequenumber", "transactionid", "fitid"];

function findHeader(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const hit = headers.find((h) => normHeader(h) === c);
    if (hit !== undefined) return hit;
  }
  return null;
}

/**
 * Parse a statement money cell. Handles thousands separators, currency
 * symbols and accounting-style parentheses negatives. Returns null when
 * the cell has no parseable number.
 */
function parseStatementAmount(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^0-9.,-]/g, "");
  const n = parseAmount(s);
  if (s.replace(/[,.-]/g, "") === "") return null;
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/**
 * True only for a real calendar date. A round-trip check is required
 * because `new Date("2026-02-31")` silently rolls over to Mar 3 instead of
 * failing — and Postgres's `date` column rejects such values, which would
 * abort the whole import batch with a raw DB error.
 */
function isValidCalendarDate(y: string, mm: string, dd: string): boolean {
  const iso = `${y}-${mm}-${dd}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === iso;
}

/** Normalize a statement date cell to YYYY-MM-DD; null when unparseable. */
function parseStatementDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // ISO already (allow a trailing time part).
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    if (!isValidCalendarDate(iso[1], iso[2], iso[3])) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  // US-style M/D/YYYY or M-D-YYYY (2-digit years land in 20xx).
  const us = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (us) {
    const [, m, d, yRaw] = us;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const mm = m.padStart(2, "0");
    const dd = d.padStart(2, "0");
    if (!isValidCalendarDate(y, mm, dd)) return null;
    return `${y}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Parse a raw bank-statement CSV into normalized rows. Unusable rows are
 * reported in `errors` and skipped; the caller decides whether to abort
 * or import the good ones.
 */
export function parseBankStatementCsv(text: string): BankStatementParseResult {
  const parsed = parseCsv(text);
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return { rows: [], errors: [], headerError: "The CSV has no data rows." };
  }

  const dateCol = findHeader(parsed.headers, DATE_HEADERS);
  const descCol = findHeader(parsed.headers, DESC_HEADERS);
  const amountCol = findHeader(parsed.headers, AMOUNT_HEADERS);
  const debitCol = findHeader(parsed.headers, DEBIT_HEADERS);
  const creditCol = findHeader(parsed.headers, CREDIT_HEADERS);
  const refCol = findHeader(parsed.headers, REF_HEADERS);

  if (!dateCol) {
    return { rows: [], errors: [], headerError: "No Date column found. Accepted headers: Date, Transaction Date, Posted Date, Value Date." };
  }
  if (!descCol) {
    return { rows: [], errors: [], headerError: "No Description column found. Accepted headers: Description, Memo, Details, Narrative, Payee." };
  }
  if (!amountCol && !debitCol && !creditCol) {
    return { rows: [], errors: [], headerError: "No amount column found. Provide an Amount column, or separate Debit and Credit columns." };
  }

  const rows: BankStatementRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rowNo = i + 2; // 1-based + header row, matches the settings importer
    const date = parseStatementDate(row[dateCol]);
    if (!date) {
      errors.push(`Row ${rowNo}: unparseable date "${row[dateCol] ?? ""}".`);
      continue;
    }
    const description = (row[descCol] ?? "").trim();
    if (!description) {
      errors.push(`Row ${rowNo}: description is empty.`);
      continue;
    }

    let amount: number | null = null;
    if (amountCol) amount = parseStatementAmount(row[amountCol]);
    if (amount == null && (debitCol || creditCol)) {
      const debit = debitCol ? parseStatementAmount(row[debitCol]) : null;
      const credit = creditCol ? parseStatementAmount(row[creditCol]) : null;
      if (debit != null || credit != null) {
        // Deposits positive, outflows negative. Banks print debit columns
        // as positive magnitudes, so take absolute values defensively.
        amount = Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
      }
    }
    if (amount == null) {
      errors.push(`Row ${rowNo}: no parseable amount.`);
      continue;
    }
    if (amount === 0) {
      errors.push(`Row ${rowNo}: zero amount — skipped.`);
      continue;
    }

    const reference = refCol ? (row[refCol] ?? "").trim() || null : null;
    rows.push({ transactionDate: date, description, amount, reference });
  }

  return { rows, errors, headerError: null };
}

// --------- Journal-entry CSV (multi-line grouped import at /journal/import) ---------
//
// Rows are grouped into entries by a shared key column (Reference or Group).
// Each group becomes one balanced DRAFT journal entry. Follows the flexible
// header-matching style of parseBankStatementCsv above.
//   Columns: Date, Reference/Group, Account (code or name), Description,
//            Debit, Credit [, Firm Entity]
// The parser is pure (no DB) — it normalizes dates/amounts and does the
// per-group balance check. Account/period resolution happens later in the
// staging mutation, which has DB access.

const GROUP_HEADERS = ["reference", "ref", "group", "groupid", "entry", "entryref", "entryreference", "batch"];
const ACCOUNT_HEADERS = ["account", "accountcode", "accountname", "accountid", "glaccount", "gl"];
const FIRM_ENTITY_HEADERS = ["firmentity", "entity", "firm", "office", "firmentitycode"];

export type JournalCsvRow = {
  /** 1-based row number in the file (incl. header), for error messages. */
  rowNo: number;
  /** Normalized YYYY-MM-DD. */
  date: string;
  /** Account token as typed (code or name) — resolved later. */
  accountToken: string;
  description: string | null;
  debit: number;
  credit: number;
  /** Firm-entity token as typed (code, name, or id) — resolved later. */
  firmEntityToken: string | null;
};

export type JournalCsvGroup = {
  /** The shared key that grouped these rows (Reference / Group value). */
  key: string;
  /** Entry date taken from the first valid row. */
  date: string;
  rows: JournalCsvRow[];
  /** Row-level problems within this group (bad date/amount/account cell). */
  errors: string[];
};

export type JournalCsvParseResult = {
  groups: JournalCsvGroup[];
  /** Set when the file is unusable as a whole (missing headers / empty). */
  headerError: string | null;
};

/**
 * Parse a journal-entry CSV into per-entry groups. Grouping key is the
 * Reference / Group column. Rows with an unparseable date or a bad
 * debit/credit shape are recorded in their group's `errors` and excluded
 * from the group's `rows`, but the group is still emitted so the caller can
 * report it. A group with no groupable key column at all → headerError.
 */
export function parseJournalEntriesCsv(text: string): JournalCsvParseResult {
  const parsed = parseCsv(text);
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return { groups: [], headerError: "The CSV has no data rows." };
  }

  const dateCol = findHeader(parsed.headers, DATE_HEADERS);
  const groupCol = findHeader(parsed.headers, GROUP_HEADERS);
  const accountCol = findHeader(parsed.headers, ACCOUNT_HEADERS);
  const descCol = findHeader(parsed.headers, DESC_HEADERS);
  const debitCol = findHeader(parsed.headers, DEBIT_HEADERS);
  const creditCol = findHeader(parsed.headers, CREDIT_HEADERS);
  const firmCol = findHeader(parsed.headers, FIRM_ENTITY_HEADERS);

  if (!dateCol) {
    return { groups: [], headerError: "No Date column found." };
  }
  if (!groupCol) {
    return {
      groups: [],
      headerError:
        "No grouping column found. Provide a Reference or Group column that shares a value across the lines of one entry.",
    };
  }
  if (!accountCol) {
    return { groups: [], headerError: "No Account column found (code or name)." };
  }
  if (!debitCol || !creditCol) {
    return {
      groups: [],
      headerError: "Both a Debit and a Credit column are required.",
    };
  }

  // Preserve first-seen group order.
  const order: string[] = [];
  const byKey = new Map<string, JournalCsvGroup>();

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rowNo = i + 2; // 1-based + header row
    const key = (row[groupCol] ?? "").trim();
    if (key === "") {
      // A row with no group key can't be attached to any entry — surface it
      // under a synthetic "(no reference)" group so it isn't silently lost.
      const orphanKey = "(no reference)";
      if (!byKey.has(orphanKey)) {
        order.push(orphanKey);
        byKey.set(orphanKey, { key: orphanKey, date: "", rows: [], errors: [] });
      }
      byKey.get(orphanKey)!.errors.push(`Row ${rowNo}: missing Reference/Group value.`);
      continue;
    }
    if (!byKey.has(key)) {
      order.push(key);
      byKey.set(key, { key, date: "", rows: [], errors: [] });
    }
    const group = byKey.get(key)!;

    const date = parseStatementDate(row[dateCol]);
    if (!date) {
      group.errors.push(`Row ${rowNo}: unparseable date "${row[dateCol] ?? ""}".`);
      continue;
    }
    const accountToken = (row[accountCol] ?? "").trim();
    if (accountToken === "") {
      group.errors.push(`Row ${rowNo}: account is empty.`);
      continue;
    }
    const debit = Math.abs(parseStatementAmount(row[debitCol]) ?? 0);
    const credit = Math.abs(parseStatementAmount(row[creditCol]) ?? 0);
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      group.errors.push(
        `Row ${rowNo}: exactly one of Debit or Credit must be > 0.`,
      );
      continue;
    }

    if (group.date === "") group.date = date;
    group.rows.push({
      rowNo,
      date,
      accountToken,
      description: descCol ? (row[descCol] ?? "").trim() || null : null,
      debit,
      credit,
      firmEntityToken: firmCol ? (row[firmCol] ?? "").trim() || null : null,
    });
  }

  return { groups: order.map((k) => byKey.get(k)!), headerError: null };
}

export const ADAPTERS: Record<CsvTypeKey, CsvAdapter> = {
  contacts: {
    key: "contacts",
    label: "Contacts",
    description: "Unified contacts (clients, vendors, employees, intermediaries).",
    columns: [
      { name: "code", required: true, description: "Unique short code." },
      { name: "name", required: true, description: "Full name." },
      { name: "kind", required: true, description: "individual | organization" },
      { name: "email", description: "Optional email." },
      { name: "phone", description: "Optional phone." },
      { name: "address", description: "Optional address." },
      { name: "is_client", description: "true/false" },
      { name: "is_vendor", description: "true/false" },
      { name: "is_employee", description: "true/false" },
      { name: "is_intermediary", description: "true/false" },
      { name: "notes", description: "Optional notes." },
    ],
    example: {
      code: "CT-NEW-100",
      name: "Sample Holdings LLC",
      kind: "organization",
      email: "ar@sample.com",
      phone: "(415) 555-0000",
      address: "1 Sample St",
      is_client: "true",
      is_vendor: "false",
      is_employee: "false",
      is_intermediary: "false",
      notes: "Imported via CSV",
    },
    async load() {
      const rows = await getContacts();
      return rows.map((c) => ({
        code: c.code,
        name: c.name,
        kind: c.kind,
        email: c.email ?? "",
        phone: c.phone ?? "",
        address: c.address ?? "",
        is_client: String(c.isClient),
        is_vendor: String(c.isVendor),
        is_employee: String(c.isEmployee),
        is_intermediary: String(c.isIntermediary),
        notes: c.notes ?? "",
      }));
    },
    async insert(user, row) {
      if (!row.code) return { ok: false, error: "code is required" };
      if (!row.name) return { ok: false, error: "name is required" };
      const kind = (row.kind || "organization").toLowerCase();
      if (kind !== "individual" && kind !== "organization") {
        return { ok: false, error: `kind must be individual or organization (got ${row.kind})` };
      }
      try {
        await createContact(user, {
          code: row.code,
          name: row.name,
          kind: kind as "individual" | "organization",
          email: row.email || null,
          phone: row.phone || null,
          address: row.address || null,
          notes: row.notes || null,
          isClient: isTruthy(row.is_client),
          isVendor: isTruthy(row.is_vendor),
          isEmployee: isTruthy(row.is_employee),
          isIntermediary: isTruthy(row.is_intermediary),
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Insert failed" };
      }
    },
  },

  entities: {
    key: "entities",
    label: "Entities",
    description: "Legal structures (LLCs, trusts, S/C-corps, etc.) owned by a client.",
    columns: [
      { name: "code", required: true, description: "Unique entity code (e.g. ENT-011)." },
      { name: "name", required: true, description: "Legal name." },
      { name: "client_id", required: true, description: "Customer ID (e.g. c-001)." },
      {
        name: "kind",
        required: true,
        description: "llc | trust | scorp | ccorp | partnership | foundation | individual | other",
      },
      { name: "jurisdiction", description: "Free-form (e.g. Delaware, USA)." },
      { name: "formation_date", description: "YYYY-MM-DD" },
      { name: "status", description: "active | pending | dormant | dissolved" },
      { name: "ein", description: "Optional EIN." },
      { name: "notes", description: "Optional notes." },
    ],
    example: {
      code: "ENT-100",
      name: "Sample Holdings LLC",
      client_id: "c-001",
      kind: "llc",
      jurisdiction: "Delaware, USA",
      formation_date: "2026-01-15",
      status: "active",
      ein: "00-0000000",
      notes: "Imported",
    },
    async load() {
      const rows = await getEntities();
      return rows.map((e) => ({
        code: e.code,
        name: e.name,
        client_id: e.clientId,
        kind: e.kind,
        jurisdiction: e.jurisdiction ?? "",
        formation_date: e.formationDate ?? "",
        status: e.status,
        ein: e.ein ?? "",
        notes: e.notes ?? "",
      }));
    },
    async insert(user, row) {
      const validKinds = ["llc", "trust", "scorp", "ccorp", "partnership", "foundation", "individual", "other"];
      const validStatuses = ["active", "pending", "dormant", "dissolved"];
      if (!row.code) return { ok: false, error: "code is required" };
      if (!row.name) return { ok: false, error: "name is required" };
      if (!row.client_id) return { ok: false, error: "client_id is required" };
      const kind = (row.kind || "").toLowerCase();
      if (!validKinds.includes(kind)) {
        return { ok: false, error: `kind must be one of ${validKinds.join("/")} (got ${row.kind})` };
      }
      const status = (row.status || "active").toLowerCase();
      if (!validStatuses.includes(status)) {
        return { ok: false, error: `status must be one of ${validStatuses.join("/")} (got ${row.status})` };
      }
      try {
        await createEntity(user, {
          code: row.code,
          name: row.name,
          clientId: row.client_id,
          kind: kind as (typeof validKinds)[number] as
            | "llc"
            | "trust"
            | "scorp"
            | "ccorp"
            | "partnership"
            | "foundation"
            | "individual"
            | "other",
          jurisdiction: row.jurisdiction || null,
          formationDate: row.formation_date || null,
          status: status as "active" | "pending" | "dormant" | "dissolved",
          ein: row.ein || null,
          notes: row.notes || null,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Insert failed" };
      }
    },
  },

  customers: {
    key: "customers",
    label: "Customers (legacy)",
    description: "Existing customer table. Prefer importing as contacts.",
    columns: [
      { name: "code", required: true, description: "Unique customer code." },
      { name: "name", required: true, description: "Customer name." },
      { name: "email", description: "Optional email." },
      { name: "phone", description: "Optional phone." },
      { name: "billing_address", description: "Optional address." },
      { name: "payment_terms", description: "Net days (default 30)." },
      { name: "notes", description: "Optional notes." },
    ],
    example: {
      code: "CUST-100",
      name: "Acme Corp",
      email: "ap@acme.com",
      phone: "(415) 555-0000",
      billing_address: "1 Sample St",
      payment_terms: "30",
      notes: "",
    },
    async load() {
      const rows = await getCustomers();
      return rows.map((c) => ({
        code: c.code,
        name: c.name,
        email: c.email ?? "",
        phone: c.phone ?? "",
        billing_address: c.billingAddress ?? "",
        payment_terms: String(c.paymentTerms),
        notes: c.notes ?? "",
      }));
    },
    async insert(user, row) {
      if (!row.code) return { ok: false, error: "code is required" };
      if (!row.name) return { ok: false, error: "name is required" };
      const paymentTerms = row.payment_terms ? parseInt(row.payment_terms, 10) : 30;
      if (Number.isNaN(paymentTerms)) {
        return { ok: false, error: `payment_terms must be a number (got ${row.payment_terms})` };
      }
      try {
        await createCustomer(user, {
          code: row.code,
          name: row.name,
          email: row.email || null,
          phone: row.phone || null,
          billingAddress: row.billing_address || null,
          paymentTerms,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Insert failed" };
      }
    },
  },

  vendors: {
    key: "vendors",
    label: "Vendors (legacy)",
    description: "Existing vendor table. Prefer importing as contacts.",
    columns: [
      { name: "code", required: true, description: "Unique vendor code." },
      { name: "name", required: true, description: "Vendor name." },
      { name: "email", description: "Optional email." },
      { name: "phone", description: "Optional phone." },
      { name: "address", description: "Optional address." },
      { name: "payment_terms", description: "Net days (default 30)." },
      { name: "default_expense_account_id", description: "Optional GL account id." },
      { name: "notes", description: "Optional notes." },
    ],
    example: {
      code: "VEND-100",
      name: "Sample Vendor LLC",
      email: "ar@vendor.com",
      phone: "(415) 555-0000",
      address: "1 Sample St",
      payment_terms: "30",
      default_expense_account_id: "a-5200",
      notes: "",
    },
    async load() {
      const rows = await getVendors();
      return rows.map((v) => ({
        code: v.code,
        name: v.name,
        email: v.email ?? "",
        phone: v.phone ?? "",
        address: v.address ?? "",
        payment_terms: String(v.paymentTerms),
        default_expense_account_id: v.defaultExpenseAccountId ?? "",
        notes: v.notes ?? "",
      }));
    },
    async insert(user, row) {
      if (!row.code) return { ok: false, error: "code is required" };
      if (!row.name) return { ok: false, error: "name is required" };
      const paymentTerms = row.payment_terms ? parseInt(row.payment_terms, 10) : 30;
      if (Number.isNaN(paymentTerms)) {
        return { ok: false, error: `payment_terms must be a number (got ${row.payment_terms})` };
      }
      try {
        await createVendor(user, {
          code: row.code,
          name: row.name,
          email: row.email || null,
          phone: row.phone || null,
          address: row.address || null,
          paymentTerms,
          defaultExpenseAccountId: row.default_expense_account_id || null,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Insert failed" };
      }
    },
  },

  assets: {
    key: "assets",
    label: "Assets",
    description: "Physical / financial assets held under entities.",
    columns: [
      { name: "name", required: true, description: "Asset name." },
      {
        name: "kind",
        required: true,
        description:
          "real_estate | securities | cash | private_equity | art | vehicle | business_interest | intellectual_property | other",
      },
      { name: "entity_id", description: "Entity id when held inside a wrapper (e.g. e-001)." },
      { name: "client_id", description: "Client id when held directly by the client (e.g. c-001). Required if entity_id is empty." },
      { name: "currency_code", description: "Default USD." },
      { name: "external_ref", description: "Optional external reference." },
      { name: "acquired_date", description: "YYYY-MM-DD" },
      { name: "notes", description: "Optional notes." },
    ],
    example: {
      name: "Sample brokerage account",
      kind: "securities",
      entity_id: "e-001",
      client_id: "",
      currency_code: "USD",
      external_ref: "ACCT-12345",
      acquired_date: "2026-01-15",
      notes: "",
    },
    async load() {
      const rows = await getAssets();
      return rows.map((a) => ({
        name: a.name,
        kind: a.kind,
        entity_id: a.entityId ?? "",
        client_id: a.clientId ?? "",
        currency_code: a.currencyCode,
        external_ref: a.externalRef ?? "",
        acquired_date: a.acquiredDate ?? "",
        notes: a.notes ?? "",
      }));
    },
    async insert(user, row) {
      const validKinds = [
        "real_estate",
        "securities",
        "cash",
        "private_equity",
        "art",
        "vehicle",
        "business_interest",
        "intellectual_property",
        "other",
      ];
      if (!row.name) return { ok: false, error: "name is required" };
      if (!row.entity_id && !row.client_id) {
        return { ok: false, error: "Either entity_id or client_id is required" };
      }
      const kind = (row.kind || "").toLowerCase();
      if (!validKinds.includes(kind)) {
        return { ok: false, error: `kind must be one of ${validKinds.join("/")} (got ${row.kind})` };
      }
      try {
        await createAsset(user, {
          name: row.name,
          kind: kind as
            | "real_estate"
            | "securities"
            | "cash"
            | "private_equity"
            | "art"
            | "vehicle"
            | "business_interest"
            | "intellectual_property"
            | "other",
          entityId: row.entity_id || null,
          clientId: row.client_id || null,
          currencyCode: row.currency_code || "USD",
          externalRef: row.external_ref || null,
          acquiredDate: row.acquired_date || null,
          notes: row.notes || null,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Insert failed" };
      }
    },
  },

  time_entries: {
    key: "time_entries",
    label: "Time entries",
    description: "Logged time with optional client/entity tagging.",
    columns: [
      { name: "entry_date", required: true, description: "YYYY-MM-DD" },
      { name: "user_id", required: true, description: "User id (e.g. u-margery)." },
      { name: "duration_hours", required: true, description: "Decimal hours." },
      { name: "description", required: true, description: "What was the work." },
      { name: "client_id", description: "Optional client id." },
      { name: "entity_id", description: "Optional entity id." },
      { name: "task_type", description: "Free-form category." },
      { name: "is_billable", description: "true/false" },
      { name: "rate_at_log", description: "Rate captured at log time." },
      { name: "notes", description: "Optional notes." },
    ],
    example: {
      entry_date: "2026-05-13",
      user_id: "u-margery",
      duration_hours: "1.50",
      description: "Sample work",
      client_id: "c-001",
      entity_id: "e-001",
      task_type: "Bookkeeping",
      is_billable: "true",
      rate_at_log: "125.00",
      notes: "",
    },
    async load() {
      const rows = await getTimeEntries();
      return rows.map((t) => ({
        entry_date: t.entryDate,
        user_id: t.userId,
        duration_hours: t.durationHours,
        description: t.description,
        client_id: t.clientId ?? "",
        entity_id: t.entityId ?? "",
        task_type: t.taskType ?? "",
        is_billable: String(t.isBillable),
        rate_at_log: t.rateAtLog ?? "",
        notes: t.notes ?? "",
      }));
    },
    async insert(user, row) {
      if (!row.entry_date) return { ok: false, error: "entry_date is required" };
      if (!row.user_id) return { ok: false, error: "user_id is required" };
      if (!row.duration_hours) return { ok: false, error: "duration_hours is required" };
      if (!row.description) return { ok: false, error: "description is required" };
      const duration = parseAmount(row.duration_hours);
      if (!Number.isFinite(duration) || duration <= 0) {
        return { ok: false, error: "duration_hours must be > 0" };
      }
      try {
        await createTimeEntry(user, {
          userId: row.user_id,
          entryDate: row.entry_date,
          durationHours: duration,
          description: row.description,
          clientId: row.client_id || null,
          entityId: row.entity_id || null,
          taskType: row.task_type || null,
          isBillable: isTruthy(row.is_billable),
          rateAtLog: row.rate_at_log ? parseAmount(row.rate_at_log) : null,
          notes: row.notes || null,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Insert failed" };
      }
    },
  },
};
