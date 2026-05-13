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
      { name: "entity_id", required: true, description: "Entity id (e.g. e-001)." },
      { name: "currency_code", description: "Default USD." },
      { name: "external_ref", description: "Optional external reference." },
      { name: "acquired_date", description: "YYYY-MM-DD" },
      { name: "notes", description: "Optional notes." },
    ],
    example: {
      name: "Sample brokerage account",
      kind: "securities",
      entity_id: "e-001",
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
        entity_id: a.entityId,
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
      if (!row.entity_id) return { ok: false, error: "entity_id is required" };
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
          entityId: row.entity_id,
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
