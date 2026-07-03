/**
 * Pragmatic non-destructive schema sync. Adds any column from src/db/schema.ts
 * that's missing in the database. Doesn't drop columns/constraints. Used as a
 * fallback when drizzle-kit push hits an interactive prompt we can't easily
 * answer in CI.
 */
import postgres from "postgres";

// Drizzle column type → Postgres column type
const NULLABLE_TEXT = "text";

type ColumnSpec = { table: string; column: string; type: string; notNull?: boolean; default?: string };

// Enum values added after the type was first created. Applied with
// ALTER TYPE ... ADD VALUE IF NOT EXISTS (idempotent, additive only).
const ENUM_VALUES: Array<{ enumName: string; value: string }> = [
  { enumName: "asset_kind", value: "bank_account" },
];

const COLUMNS: ColumnSpec[] = [
  // Typed asset details + bank-account-as-asset link
  { table: "assets", column: "details", type: "jsonb", notNull: true, default: "'{}'::jsonb" },
  { table: "assets", column: "bank_account_id", type: "text" },

  // Full (maskable) account number + ABA routing on bank accounts
  { table: "bank_accounts", column: "account_number", type: "text" },
  { table: "bank_accounts", column: "routing_number", type: "text" },

  // Per-user dashboard customization
  { table: "users", column: "dashboard_prefs", type: "jsonb" },

  // Richer bank details (client accounts especially)
  { table: "bank_accounts", column: "account_type", type: "text" },
  { table: "bank_accounts", column: "swift_bic", type: "text" },
  { table: "bank_accounts", column: "iban", type: "text" },
  { table: "bank_accounts", column: "bank_address", type: "text" },
  { table: "bank_accounts", column: "bank_country", type: "text" },

  // Split chargebacks: per-line client billing on vendor bills
  { table: "bills", column: "chargeback_split", type: "boolean", notNull: true, default: "false" },
  { table: "bills", column: "chargeback_split_by", type: "text" },
  { table: "bill_lines", column: "chargeback_invoice_id", type: "text" },

  // entities additions
  { table: "entities", column: "currency_code", type: "text", notNull: true, default: "'USD'" },

  // accounts.entity_id (per-entity COA)
  { table: "accounts", column: "entity_id", type: "text" },

  // journal_entries.entity_id
  { table: "journal_entries", column: "entity_id", type: "text" },

  // time_entries.client_id (for time tracking attribution)
  { table: "time_entries", column: "client_id", type: "text" },

  // assets dual-attach
  { table: "assets", column: "client_id", type: "text" },

  // bank_accounts dual-attach
  { table: "bank_accounts", column: "client_id", type: "text" },

  // invoices: dual-attach + approval workflow fields
  { table: "invoices", column: "entity_id", type: "text" },
  { table: "invoices", column: "client_id", type: "text" },
  { table: "invoices", column: "cfo_approved_at", type: "timestamp with time zone" },
  { table: "invoices", column: "cfo_approved_by", type: "text" },
  { table: "invoices", column: "assigned_approved_at", type: "timestamp with time zone" },
  { table: "invoices", column: "assigned_approved_by", type: "text" },
  { table: "invoices", column: "rejected_at", type: "timestamp with time zone" },
  { table: "invoices", column: "rejected_by", type: "text" },
  { table: "invoices", column: "rejection_reason", type: "text" },

  // customers: assigned employee (user) for the approval workflow
  { table: "customers", column: "assigned_user_id", type: "text" },

  // ---- Recurring entity services (turn annual fees into a billing schedule) ----
  // Frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'one_time'
  { table: "entity_fees", column: "frequency", type: "text", notNull: true, default: "'annual'" },
  // Coverage window. Default startDate falls back to entity.formation_date.
  { table: "entity_fees", column: "start_date", type: "date" },
  { table: "entity_fees", column: "end_date", type: "date" },
  // Billing schedule: which month/day to bill (e.g. bill every March → 3, day 1).
  { table: "entity_fees", column: "billing_month", type: "integer" },
  { table: "entity_fees", column: "billing_day", type: "integer" },
  // Forward-looking cursor for the next billable run.
  { table: "entity_fees", column: "next_billing_date", type: "date" },
  { table: "entity_fees", column: "last_billed_date", type: "date" },
  // Per-period amount (e.g. $5,000/month). NULL → derived from annual_fee.
  { table: "entity_fees", column: "per_period_amount", type: "numeric(15,2)" },

  // Time entries can be attributed to a specific entity service so we can
  // see hours-billed vs hours-included.
  { table: "time_entries", column: "entity_fee_id", type: "text" },

  // Invoice expected payment date (employee-updatable; drives cash forecast).
  { table: "invoices", column: "expected_payment_date", type: "date" },

  // Entity registration number (corporate filing # / EIN-equivalent).
  { table: "entities", column: "registration_number", type: "text" },

  // ---- Firm (corporate billing) entity attribution ----
  // We bill clients FROM one of our firm's corporate entities. Each
  // journal entry / invoice carries the firm_entity_id of the billing
  // firm. Firms live in the `offices` table (lightly repurposed).
  { table: "journal_entries", column: "firm_entity_id", type: "text" },
  { table: "journal_lines", column: "firm_entity_id", type: "text" },
  { table: "invoices", column: "firm_entity_id", type: "text" },

  // ---- Offices repurposed as firm entities ----
  { table: "offices", column: "kind", type: "text" },
  { table: "offices", column: "jurisdiction", type: "text" },
  { table: "offices", column: "ein", type: "text" },
  { table: "offices", column: "registration_number", type: "text" },
  { table: "offices", column: "formation_date", type: "date" },
  { table: "offices", column: "address", type: "text" },

  // ---- Vendor bill chargeback (rebill to client / entity) ----
  // A bill can be charged back to a client or entity at cost, with a
  // markup %, with a fixed rebill amount, or marked as already covered
  // by an annual fee (no rebill, just metadata).
  // chargeback_type: null = no chargeback
  //                  'cost' = rebill at cost (1:1)
  //                  'markup' = bill amount × (1 + markup_pct/100)
  //                  'fixed' = rebill_amount (override)
  //                  'included' = included in annual fee (no rebill)
  // Bill on-behalf-of: who the bill was incurred for (vs. chargeback which
  // tracks if the bill is rebilled). Both nullable; firms can scope by either.
  { table: "bills", column: "client_id", type: "text" },
  { table: "bills", column: "entity_id", type: "text" },
  { table: "bill_lines", column: "client_id", type: "text" },
  { table: "bill_lines", column: "entity_id", type: "text" },
  { table: "bills", column: "chargeback_client_id", type: "text" },
  { table: "bills", column: "chargeback_entity_id", type: "text" },
  { table: "bills", column: "chargeback_type", type: "text" },
  { table: "bills", column: "markup_pct", type: "numeric(7,4)" },
  { table: "bills", column: "rebill_amount", type: "numeric(15,2)" },
  /** The invoice created when this chargeback was rebilled. NULL = not yet billed. */
  { table: "bills", column: "chargeback_invoice_id", type: "text" },
  { table: "bills", column: "chargeback_notes", type: "text" },

  // ---- Office regions ----
  // Offices (firm corporate entities) can be grouped into regions and
  // regions into region groups for reporting. Both are optional. The same
  // soft FK is mirrored on entities and customers so clients/legal
  // entities can be sliced by region too.
  { table: "offices", column: "region_id", type: "text" },
  { table: "entities", column: "region_id", type: "text" },
  { table: "customers", column: "region_id", type: "text" },

  // ---- Dimensions on transactional lines (JSONB key/value) ----
  // {"department": "dv-dep-eng", "project": "dv-proj-ledger-tool"}
  // Key matches dimensions.key, value matches dimension_values.id.
  // Department is a regular dimension (with a known key "department"); the
  // table just has a sensible default so existing rows backfill to {}.
  { table: "journal_lines", column: "dimensions", type: "jsonb", notNull: true, default: "'{}'::jsonb" },
  { table: "invoice_lines", column: "dimensions", type: "jsonb", notNull: true, default: "'{}'::jsonb" },
  { table: "bill_lines", column: "dimensions", type: "jsonb", notNull: true, default: "'{}'::jsonb" },

  // ---- Vendor invoice numbering ----
  // Optional convention so bill entry can auto-suggest the next vendor
  // invoice number and warn on duplicates within the same vendor.
  { table: "vendors", column: "invoice_number_prefix", type: "text" },
  { table: "vendors", column: "invoice_number_pattern", type: "text" },
  { table: "vendors", column: "invoice_number_last_used", type: "text" },
  // ---- Vendor approval workflow ----
  // OCR-created vendors land in `pending`; bills against them can be
  // drafted but not approved/paid. Existing rows backfill to `approved`
  // so nothing in the seed data is locked out retroactively.
  { table: "vendors", column: "approval_status", type: "text", notNull: true, default: "'approved'" },
  { table: "vendors", column: "approved_at", type: "timestamptz" },
  { table: "vendors", column: "approved_by_user_id", type: "text" },
  { table: "vendors", column: "approval_notes", type: "text" },
  // The vendor's own invoice number recorded on a bill (separate from our
  // internal bill_number). Used for duplicate detection per (vendor, number).
  { table: "bills", column: "vendor_invoice_number", type: "text" },

  // ---- Posting controls ----
  // Audit flag: set to true when the user explicitly confirmed past a
  // controlled-account posting warning (direct posting to AR/AP/Cash).
  { table: "journal_entries", column: "bypass_control_warning", type: "boolean", notNull: true, default: "false" },

  // ---- Period close override reason ----
  // Set when a user posts a JE/invoice/bill into a soft-closed period —
  // captures the reason for audit. Locked periods always hard-block, so
  // there's nothing to record for those.
  { table: "journal_entries", column: "period_override_reason", type: "text" },
  { table: "invoices", column: "period_override_reason", type: "text" },
  { table: "bills", column: "period_override_reason", type: "text" },

  // ---- Intercompany + eliminations ----
  // Per-line counterpart firm entity for intercompany transactions.
  { table: "journal_lines", column: "intercompany_counterpart_entity_id", type: "text" },
  // On the JE head: if set, this entry is an elimination (consolidation
  // adjustment). Self-FK → journal_entries.id (pointer to a source IC JE).
  { table: "journal_entries", column: "elimination_entry_id", type: "text" },

  // ---- Recurring journal entry templates ----
  // A JE row with is_template=true is a blueprint (status='template'). It
  // never appears in the ledger. Generated entries copy its lines, start as
  // status='draft', and back-link via recurring_parent_id.
  { table: "journal_entries", column: "is_template", type: "boolean", notNull: true, default: "false" },
  // 'monthly' | 'quarterly' | 'annually' | 'custom'
  { table: "journal_entries", column: "recurring_frequency", type: "text" },
  { table: "journal_entries", column: "recurring_day_of_month", type: "integer" },
  { table: "journal_entries", column: "recurring_next_date", type: "date" },
  { table: "journal_entries", column: "recurring_end_date", type: "date" },
  { table: "journal_entries", column: "recurring_parent_id", type: "text" },

  // ---- Security module: per-user attributes ----
  // Stamped every successful Auth.js login. NULL → never logged in.
  { table: "users", column: "last_login_at", type: "timestamp with time zone" },

  // ---- Sales / VAT tax on client invoices ----
  // tax_rate is the decimal rate (0.0875 → 8.75%). tax_exempt forces
  // tax_amount to 0 regardless of rate. The customer row carries the
  // default; the invoice row snapshots it at create time so historical
  // numbers stay stable when the customer's default later changes.
  { table: "customers", column: "tax_rate", type: "numeric(6,5)", notNull: true, default: "0" },
  { table: "customers", column: "tax_exempt", type: "boolean", notNull: true, default: "false" },
  { table: "invoices",  column: "tax_rate", type: "numeric(6,5)", notNull: true, default: "0" },
  { table: "invoices",  column: "tax_exempt", type: "boolean", notNull: true, default: "false" },

  // ---- Ownership % on entities and bank accounts ----
  // Beneficial ownership of the entity / account by the linked client,
  // expressed as a percent (0–100). NULL = unspecified (treated as 100%
  // for AUA rollup; shown as "— ownership" in the UI).
  { table: "entities",      column: "ownership_percent", type: "numeric(5,2)" },
  { table: "bank_accounts", column: "ownership_percent", type: "numeric(5,2)" },

  // ---- Asset valuation date ----
  // The "as of" date for the asset's current carrying value. Independent
  // from asset_value_snapshots — drives the AUA report's as-of-date filter.
  { table: "assets", column: "valuation_date", type: "date" },

  // ---- Recurring client invoice templates ----
  // Same shape as journal_entries recurring fields. is_template=true rows
  // are blueprints — they never hit AR. Generated invoices land as drafts
  // dated by recurring_next_date and back-link via recurring_parent_id.
  // billing_period_start/end are stamped on generated invoices to record
  // which period the invoice is billing for ("Jan 1 – Jan 31, 2026").
  { table: "invoices", column: "is_template", type: "boolean", notNull: true, default: "false" },
  { table: "invoices", column: "recurring_frequency", type: "text" },
  { table: "invoices", column: "recurring_day_of_month", type: "integer" },
  { table: "invoices", column: "recurring_next_date", type: "date" },
  { table: "invoices", column: "recurring_end_date", type: "date" },
  { table: "invoices", column: "recurring_parent_id", type: "text" },
  { table: "invoices", column: "billing_period_start", type: "date" },
  { table: "invoices", column: "billing_period_end", type: "date" },

  // ---- Time entries → invoice link ----
  // Stamped when a time entry is added as a line on an invoice (via the
  // unbilled-time picker on /invoices/new). NULL = unbilled.
  { table: "time_entries", column: "invoice_id", type: "text" },

  // ---- Foreign-currency snapshot on transactional documents ----
  // fx_rate uses the same "rate_per_base" convention as fx_rates:
  // 1 base currency = fx_rate native units. So a EUR invoice when the
  // EUR rate is 0.925 stores fx_rate = 0.925. Base amount = native /
  // fx_rate. NULL means "no FX needed" — document is already in base
  // currency. Snapshotted at create time so historical totals stay
  // stable when the live FX rate later moves.
  { table: "invoices",        column: "fx_rate", type: "numeric(18,8)" },
  { table: "bills",           column: "fx_rate", type: "numeric(18,8)" },
  { table: "journal_entries", column: "fx_rate", type: "numeric(18,8)" },

  // ---- Bank transaction provenance ----
  // 'system' = created by invoice/bill payment posting; 'import' = bank
  // statement CSV import; 'manual' = keyed by hand on /bank/[id].
  { table: "bank_transactions", column: "source", type: "text", notNull: true, default: "'system'" },
  { table: "bank_transactions", column: "statement_import_id", type: "text" },
  // Set when the transaction is cleared inside a reconciliation session.
  { table: "bank_transactions", column: "reconciliation_session_id", type: "text" },

  // ---- JE maker-checker approval ----
  // Status machine grows: draft → pending_approval → approved → posted.
  // Existing draft→posted direct flow stays for roles with journal_entry.approve
  // (self-posting still requires a second approver when required_approval=true).
  { table: "journal_entries", column: "submitted_at", type: "timestamp with time zone" },
  { table: "journal_entries", column: "submitted_by", type: "text" },
  { table: "journal_entries", column: "approved_at", type: "timestamp with time zone" },
  { table: "journal_entries", column: "approved_by", type: "text" },
  { table: "journal_entries", column: "approval_rejection_reason", type: "text" },
  // ---- Auto-reversing accruals ----
  // When true, posting generates a mirrored entry dated day 1 of the next
  // open period; reversal_entry_id links to it.
  { table: "journal_entries", column: "auto_reverse", type: "boolean", notNull: true, default: "false" },
  { table: "journal_entries", column: "reversal_entry_id", type: "text" },
  // Year-end closing entries are excluded from income-statement queries
  // (they zero P&L into retained earnings) but included in balance sheets.
  { table: "journal_entries", column: "is_closing_entry", type: "boolean", notNull: true, default: "false" },

  // ---- KYC / AML due diligence (customers + client entities) ----
  // kyc_status: not_started | in_progress | verified  (overdue is derived
  // from kyc_next_review_date < today). risk_rating: low | medium | high.
  { table: "customers", column: "kyc_status", type: "text", notNull: true, default: "'not_started'" },
  { table: "customers", column: "risk_rating", type: "text" },
  { table: "customers", column: "pep_flag", type: "boolean", notNull: true, default: "false" },
  { table: "customers", column: "sanctions_checked_at", type: "timestamp with time zone" },
  { table: "customers", column: "kyc_next_review_date", type: "date" },
  { table: "customers", column: "kyc_notes", type: "text" },
  { table: "entities", column: "kyc_status", type: "text", notNull: true, default: "'not_started'" },
  { table: "entities", column: "risk_rating", type: "text" },
  { table: "entities", column: "pep_flag", type: "boolean", notNull: true, default: "false" },
  { table: "entities", column: "sanctions_checked_at", type: "timestamp with time zone" },
  { table: "entities", column: "kyc_next_review_date", type: "date" },
  { table: "entities", column: "kyc_notes", type: "text" },

  // ---- VAT / GST tax codes on document lines ----
  // Per-line tax coding (standard/reduced/zero_rated/exempt). Line tax
  // amounts roll up to the header tax_amount. Invoice-level tax_rate
  // snapshot stays for legacy single-rate invoices.
  { table: "invoice_lines", column: "tax_code_id", type: "text" },
  { table: "invoice_lines", column: "tax_amount", type: "numeric(15,2)", notNull: true, default: "0" },
  { table: "bill_lines", column: "tax_code_id", type: "text" },
  { table: "bill_lines", column: "tax_amount", type: "numeric(15,2)", notNull: true, default: "0" },

  // ---- Credit memos / vendor credits / write-offs ----
  // invoices.kind: 'invoice' | 'credit_memo'; bills.kind: 'bill' | 'vendor_credit'.
  // Credit memos store NEGATIVE subtotal/total/balance_due so every existing
  // AR/AP sum stays correct without kind-awareness.
  { table: "invoices", column: "kind", type: "text", notNull: true, default: "'invoice'" },
  { table: "invoices", column: "written_off_at", type: "timestamp with time zone" },
  { table: "invoices", column: "written_off_by", type: "text" },
  { table: "invoices", column: "writeoff_reason", type: "text" },
  { table: "invoices", column: "writeoff_journal_entry_id", type: "text" },
  { table: "bills", column: "kind", type: "text", notNull: true, default: "'bill'" },

  // ---- Funds on account / retainers ----
  // A payment can exceed its allocations; the remainder stays as unapplied_amount
  // (client money held as a liability until applied to an invoice).
  { table: "payments", column: "unapplied_amount", type: "numeric(15,2)", notNull: true, default: "0" },
  { table: "payments", column: "firm_entity_id", type: "text" },
  { table: "payments", column: "currency_code", type: "text", notNull: true, default: "'USD'" },
  // 'standard' | 'retainer' — retainers land wholly unapplied on receipt.
  { table: "payments", column: "kind", type: "text", notNull: true, default: "'standard'" },

  // ---- Deferred revenue (opt-in) ----
  // Line-level flag: defer this line's revenue over [deferral_start,
  // deferral_end] via a revenue_recognition_schedule created at posting.
  { table: "invoice_lines", column: "defer_revenue", type: "boolean", notNull: true, default: "false" },
  { table: "invoice_lines", column: "deferral_start", type: "date" },
  { table: "invoice_lines", column: "deferral_end", type: "date" },
  // Fee-level default: invoices generated from this fee defer over the
  // fee's coverage window.
  { table: "entity_fees", column: "defer_revenue", type: "boolean", notNull: true, default: "false" },

  // ---- Beneficiary register (distributions) ----
  { table: "contacts", column: "is_beneficiary", type: "boolean", notNull: true, default: "false" },
];

const TABLES = [
  {
    // Per-account variance explanations for the Variance Analysis report.
    // AI writes the default (source='ai'); accountant edits flip source to
    // 'user' and are never overwritten by regeneration.
    name: "variance_notes",
    ddl: `CREATE TABLE IF NOT EXISTS variance_notes (
      id text PRIMARY KEY,
      fiscal_year integer NOT NULL,
      month integer NOT NULL,
      mode text NOT NULL,
      compare text NOT NULL,
      account_id text NOT NULL,
      note text NOT NULL,
      source text DEFAULT 'ai' NOT NULL,
      updated_by text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT variance_notes_key UNIQUE (fiscal_year, month, mode, compare, account_id)
    )`,
  },
  {
    // Monthly period close. Status starts "open"; admins move to "closed"
    // (soft warning + override w/ reason on new entries) or "locked" (hard
    // block). Auto-seeded for the current year + next year by the
    // settings/periods page on first load.
    name: "accounting_periods",
    ddl: `CREATE TABLE IF NOT EXISTS accounting_periods (
      id text PRIMARY KEY,
      name text UNIQUE NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      status text DEFAULT 'open' NOT NULL,
      closed_at timestamp with time zone,
      closed_by text,
      locked_at timestamp with time zone,
      locked_by text,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Append-only invoice notes — used by the invoice detail page to log
    // ad-hoc comments from CSMs / collections (no edits, no deletes).
    name: "invoice_notes",
    ddl: `CREATE TABLE IF NOT EXISTS invoice_notes (
      id text PRIMARY KEY,
      invoice_id text NOT NULL,
      note text NOT NULL,
      author_name text NOT NULL,
      author_user_id text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "currencies",
    ddl: `CREATE TABLE IF NOT EXISTS currencies (
      code text PRIMARY KEY,
      symbol text NOT NULL,
      name text NOT NULL,
      decimals integer DEFAULT 2 NOT NULL,
      is_base boolean DEFAULT false NOT NULL,
      is_active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "fx_rates",
    ddl: `CREATE TABLE IF NOT EXISTS fx_rates (
      id text PRIMARY KEY,
      currency_code text NOT NULL,
      rate_date date NOT NULL,
      rate_per_base numeric(18,8) NOT NULL,
      source text,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "lookup_tables",
    ddl: `CREATE TABLE IF NOT EXISTS lookup_tables (
      key text PRIMARY KEY,
      label text NOT NULL,
      description text,
      is_system boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "lookup_values",
    ddl: `CREATE TABLE IF NOT EXISTS lookup_values (
      id text PRIMARY KEY,
      table_key text NOT NULL,
      code text NOT NULL,
      label text NOT NULL,
      sort_order integer DEFAULT 0 NOT NULL,
      is_active boolean DEFAULT true NOT NULL,
      is_system boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "custom_field_definitions",
    ddl: `CREATE TABLE IF NOT EXISTS custom_field_definitions (
      id text PRIMARY KEY,
      record_type text NOT NULL,
      field_key text NOT NULL,
      label text NOT NULL,
      field_type text NOT NULL,
      options jsonb,
      sort_order integer DEFAULT 0 NOT NULL,
      is_required boolean DEFAULT false NOT NULL,
      is_active boolean DEFAULT true NOT NULL,
      help_text text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Polymorphic file attachments stored on Vercel Blob. Keyed by
    // (record_type, record_id) so any entity in the system (assets, bills,
    // invoices, contacts, ...) can have files attached. Without this
    // table every detail page that calls getAttachments() server-side
    // crashes — that's the "Something went wrong" the user saw on
    // /aua/as-008.
    name: "attachments",
    ddl: `DO $$ BEGIN
      CREATE TYPE attachment_record_type AS ENUM (
        'journal_entry', 'invoice', 'bill', 'contact', 'entity',
        'asset', 'bank_account', 'fee', 'time_entry', 'other'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE IF NOT EXISTS attachments (
      id text PRIMARY KEY,
      record_type attachment_record_type NOT NULL,
      record_id text NOT NULL,
      file_name text NOT NULL,
      file_size integer NOT NULL,
      mime_type text NOT NULL,
      file_url text NOT NULL,
      blob_pathname text,
      uploaded_by text,
      notes text,
      document_type text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "custom_field_values",
    ddl: `CREATE TABLE IF NOT EXISTS custom_field_values (
      id text PRIMARY KEY,
      record_type text NOT NULL,
      record_id text NOT NULL,
      field_id text NOT NULL,
      value_text text,
      value_number numeric(20,4),
      value_date date,
      value_boolean boolean,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  // price_lists / price_list_entries — minimal version matching schema.ts
  {
    name: "price_lists",
    ddl: `CREATE TABLE IF NOT EXISTS price_lists (
      id text PRIMARY KEY,
      office_id text NOT NULL,
      name text NOT NULL,
      version_number integer DEFAULT 1 NOT NULL,
      effective_date date NOT NULL,
      is_active boolean DEFAULT true NOT NULL,
      is_current boolean DEFAULT false NOT NULL,
      parent_version_id text,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "price_list_entries",
    ddl: `CREATE TABLE IF NOT EXISTS price_list_entries (
      id text PRIMARY KEY,
      price_list_id text NOT NULL,
      item_type text NOT NULL,
      item_key text NOT NULL,
      label text NOT NULL,
      unit_price numeric(15,2) NOT NULL,
      included_quantity numeric(8,2),
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "offices",
    ddl: `CREATE TABLE IF NOT EXISTS offices (
      id text PRIMARY KEY,
      code text NOT NULL UNIQUE,
      name text NOT NULL,
      country text,
      currency_code text DEFAULT 'USD' NOT NULL,
      is_active boolean DEFAULT true NOT NULL,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "contact_links",
    ddl: `CREATE TABLE IF NOT EXISTS contact_links (
      id text PRIMARY KEY,
      contact_id text NOT NULL,
      ref_type text NOT NULL,
      ref_id text NOT NULL,
      role text,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "recurring_payments",
    ddl: `CREATE TABLE IF NOT EXISTS recurring_payments (
      id text PRIMARY KEY,
      name text NOT NULL,
      amount numeric(15,2) NOT NULL,
      frequency text NOT NULL,
      next_payment_date date NOT NULL,
      expense_account_id text NOT NULL,
      vendor_id text,
      bank_account_id text,
      is_active boolean DEFAULT true NOT NULL,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "budgets",
    ddl: `CREATE TABLE IF NOT EXISTS budgets (
      id text PRIMARY KEY,
      account_id text NOT NULL,
      fiscal_year integer NOT NULL,
      month integer,
      amount numeric(15,2) NOT NULL,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Many-to-many: which users (employees) are assigned to which client.
    // is_primary marks one as the lead; can_approve flags whether they can
    // grant the "assigned employee" approval on invoices for this client.
    name: "customer_assignments",
    ddl: `CREATE TABLE IF NOT EXISTS customer_assignments (
      id text PRIMARY KEY,
      customer_id text NOT NULL,
      user_id text NOT NULL,
      is_primary boolean DEFAULT false NOT NULL,
      can_approve boolean DEFAULT true NOT NULL,
      role text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE (customer_id, user_id)
    )`,
  },
  {
    // Top-level grouping of regions (e.g., Americas, EMEA, APAC).
    name: "region_groups",
    ddl: `CREATE TABLE IF NOT EXISTS region_groups (
      id text PRIMARY KEY,
      name text NOT NULL,
      notes text,
      display_order integer DEFAULT 0 NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Regions belong to an (optional) region_group; offices belong to an
    // (optional) region. Both can be re-pointed via the office detail page.
    name: "regions",
    ddl: `CREATE TABLE IF NOT EXISTS regions (
      id text PRIMARY KEY,
      name text NOT NULL,
      group_id text,
      notes text,
      display_order integer DEFAULT 0 NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // A "dimension" is an arbitrary slicer (Department, Project, Cost
    // Center, ...). Each dimension has a stable `key` slug used inside
    // the journal_lines.dimensions JSONB.
    name: "dimensions",
    ddl: `CREATE TABLE IF NOT EXISTS dimensions (
      id text PRIMARY KEY,
      key text UNIQUE NOT NULL,
      label text NOT NULL,
      description text,
      is_active boolean DEFAULT true NOT NULL,
      display_order integer DEFAULT 0 NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Allowed values for each dimension. parent_id allows hierarchical
    // dimensions (Department > Sub-department; Region > Sub-region).
    name: "dimension_values",
    ddl: `CREATE TABLE IF NOT EXISTS dimension_values (
      id text PRIMARY KEY,
      dimension_id text NOT NULL,
      code text NOT NULL,
      label text NOT NULL,
      parent_id text,
      is_active boolean DEFAULT true NOT NULL,
      display_order integer DEFAULT 0 NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE (dimension_id, code)
    )`,
  },
  {
    // Per-user entity scoping. No rows for a user = sees all entities
    // (admin default). access_level controls full vs. read_only.
    name: "user_entity_access",
    ddl: `CREATE TABLE IF NOT EXISTS user_entity_access (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      entity_id text NOT NULL,
      access_level text NOT NULL DEFAULT 'full',
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE (user_id, entity_id)
    )`,
  },
  {
    // Per-user client scoping. Mirror of user_entity_access keyed on
    // customers.id — used by the "employee" role.
    name: "user_client_access",
    ddl: `CREATE TABLE IF NOT EXISTS user_client_access (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      customer_id text NOT NULL,
      access_level text NOT NULL DEFAULT 'full',
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE (user_id, customer_id)
    )`,
  },
  {
    // Immutable audit trail. User identity columns are denormalised so
    // history survives later user renames / deletes. Indexed by timestamp.
    name: "audit_log",
    ddl: `CREATE TABLE IF NOT EXISTS audit_log (
      id text PRIMARY KEY,
      timestamp timestamp with time zone DEFAULT now() NOT NULL,
      user_id text,
      user_email text,
      user_role text,
      action text NOT NULL,
      resource_type text,
      resource_id text,
      resource_name text,
      changes jsonb,
      ip_address text,
      user_agent text,
      metadata jsonb
    );
    CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log (timestamp DESC);
    CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log (user_id);
    CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);
    CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log (resource_type, resource_id)`,
  },
  {
    // One row per bank-statement CSV import — provenance + dedupe stats.
    name: "statement_imports",
    ddl: `CREATE TABLE IF NOT EXISTS statement_imports (
      id text PRIMARY KEY,
      bank_account_id text NOT NULL,
      file_name text NOT NULL,
      imported_by text,
      row_count integer DEFAULT 0 NOT NULL,
      duplicate_count integer DEFAULT 0 NOT NULL,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // A month-end bank reconciliation working session. Transactions cleared
    // during the session point back via bank_transactions.reconciliation_session_id.
    // status: in_progress | completed | void
    name: "reconciliation_sessions",
    ddl: `CREATE TABLE IF NOT EXISTS reconciliation_sessions (
      id text PRIMARY KEY,
      bank_account_id text NOT NULL,
      statement_date date NOT NULL,
      statement_ending_balance numeric(15,2) NOT NULL,
      status text DEFAULT 'in_progress' NOT NULL,
      started_by text,
      completed_by text,
      completed_at timestamp with time zone,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Year-end close: one row per (fiscal_year, firm_entity). Points at the
    // closing JE that moves net income into retained earnings.
    // status: closed | reopened
    name: "year_end_closes",
    ddl: `CREATE TABLE IF NOT EXISTS year_end_closes (
      id text PRIMARY KEY,
      fiscal_year integer NOT NULL,
      firm_entity_id text,
      journal_entry_id text,
      retained_earnings_account_id text NOT NULL,
      net_income numeric(15,2) NOT NULL,
      status text DEFAULT 'closed' NOT NULL,
      closed_by text,
      closed_at timestamp with time zone DEFAULT now() NOT NULL,
      reopened_by text,
      reopened_at timestamp with time zone,
      notes text,
      CONSTRAINT year_end_closes_key UNIQUE (fiscal_year, firm_entity_id)
    )`,
  },
  {
    // Compliance calendar: statutory filings / renewals per client entity.
    // kind: annual_return | license_renewal | agent_renewal | fatca | crs |
    //       tax_return | economic_substance | other
    // recurrence: none | monthly | quarterly | annual | biennial
    // status: pending | in_progress | filed | waived  (overdue derived)
    name: "entity_filings",
    ddl: `CREATE TABLE IF NOT EXISTS entity_filings (
      id text PRIMARY KEY,
      entity_id text NOT NULL,
      kind text NOT NULL,
      title text NOT NULL,
      jurisdiction text,
      due_date date NOT NULL,
      recurrence text DEFAULT 'none' NOT NULL,
      status text DEFAULT 'pending' NOT NULL,
      completed_at timestamp with time zone,
      completed_by text,
      owner_user_id text,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS entity_filings_due_idx ON entity_filings (due_date);
    CREATE INDEX IF NOT EXISTS entity_filings_entity_idx ON entity_filings (entity_id)`,
  },
  {
    // Periodic KYC/AML review log. subject_type: customer | entity.
    // outcome: cleared | escalated | refreshed
    name: "kyc_reviews",
    ddl: `CREATE TABLE IF NOT EXISTS kyc_reviews (
      id text PRIMARY KEY,
      subject_type text NOT NULL,
      subject_id text NOT NULL,
      review_date date NOT NULL,
      outcome text NOT NULL,
      risk_rating_after text,
      reviewer_user_id text,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // VAT/GST tax codes. kind: standard | reduced | zero_rated | exempt |
    // out_of_scope. Zero-rated sales are taxable at 0% (input VAT
    // recoverable, included on returns); exempt sales are outside the VAT
    // net (reported separately, input VAT generally not recoverable).
    name: "tax_codes",
    ddl: `CREATE TABLE IF NOT EXISTS tax_codes (
      id text PRIMARY KEY,
      code text UNIQUE NOT NULL,
      name text NOT NULL,
      rate numeric(6,5) DEFAULT 0 NOT NULL,
      kind text DEFAULT 'standard' NOT NULL,
      country text,
      is_active boolean DEFAULT true NOT NULL,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Application of an AR credit memo against an open invoice.
    name: "credit_applications",
    ddl: `CREATE TABLE IF NOT EXISTS credit_applications (
      id text PRIMARY KEY,
      credit_invoice_id text NOT NULL,
      target_invoice_id text NOT NULL,
      amount numeric(15,2) NOT NULL,
      applied_by text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Application of a vendor credit against an open bill.
    name: "bill_credit_applications",
    ddl: `CREATE TABLE IF NOT EXISTS bill_credit_applications (
      id text PRIMARY KEY,
      credit_bill_id text NOT NULL,
      target_bill_id text NOT NULL,
      amount numeric(15,2) NOT NULL,
      applied_by text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Dual-control payment release. Prepared by one user (draft →
    // pending_release), released by a DIFFERENT user with payment.release.
    // status: draft | pending_release | released | void
    name: "payment_runs",
    ddl: `CREATE TABLE IF NOT EXISTS payment_runs (
      id text PRIMARY KEY,
      run_number text UNIQUE NOT NULL,
      bank_account_id text NOT NULL,
      status text DEFAULT 'draft' NOT NULL,
      prepared_by text,
      prepared_at timestamp with time zone,
      released_by text,
      released_at timestamp with time zone,
      total numeric(15,2) DEFAULT 0 NOT NULL,
      item_count integer DEFAULT 0 NOT NULL,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // One bill payment inside a payment run. status: pending | paid | skipped
    name: "payment_run_items",
    ddl: `CREATE TABLE IF NOT EXISTS payment_run_items (
      id text PRIMARY KEY,
      payment_run_id text NOT NULL,
      bill_id text NOT NULL,
      amount numeric(15,2) NOT NULL,
      status text DEFAULT 'pending' NOT NULL,
      journal_entry_id text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Opt-in deferred revenue: one schedule per deferred invoice line.
    // Posting credits deferral_account; monthly recognition moves
    // straight-line slices to revenue_account. status: active | complete | cancelled
    name: "revenue_recognition_schedules",
    ddl: `CREATE TABLE IF NOT EXISTS revenue_recognition_schedules (
      id text PRIMARY KEY,
      invoice_id text NOT NULL,
      invoice_line_id text NOT NULL,
      deferral_account_id text NOT NULL,
      revenue_account_id text NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      total numeric(15,2) NOT NULL,
      recognized_amount numeric(15,2) DEFAULT 0 NOT NULL,
      status text DEFAULT 'active' NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // One recognized month per schedule; points at the recognition JE.
    name: "revenue_recognition_entries",
    ddl: `CREATE TABLE IF NOT EXISTS revenue_recognition_entries (
      id text PRIMARY KEY,
      schedule_id text NOT NULL,
      period_date date NOT NULL,
      amount numeric(15,2) NOT NULL,
      journal_entry_id text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Period-end FX revaluation run: books unrealized gain/loss on open
    // foreign-currency balances, auto-reversed next period.
    name: "fx_revaluations",
    ddl: `CREATE TABLE IF NOT EXISTS fx_revaluations (
      id text PRIMARY KEY,
      revaluation_date date NOT NULL,
      firm_entity_id text,
      journal_entry_id text,
      reversal_entry_id text,
      details jsonb,
      created_by text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Distribution to a beneficiary from a client entity. Dual approval
    // mirrors the bill workflow. journal_entry_id is set ONLY when the
    // funding account is a GL-linked firm account — client-account
    // distributions are operational records that never touch the firm ledger.
    // status: requested | first_approved | approved | paid | rejected | void
    name: "distributions",
    ddl: `CREATE TABLE IF NOT EXISTS distributions (
      id text PRIMARY KEY,
      distribution_number text UNIQUE NOT NULL,
      entity_id text NOT NULL,
      beneficiary_contact_id text NOT NULL,
      amount numeric(15,2) NOT NULL,
      currency_code text DEFAULT 'USD' NOT NULL,
      bank_account_id text,
      status text DEFAULT 'requested' NOT NULL,
      requested_by text,
      requested_at timestamp with time zone DEFAULT now() NOT NULL,
      first_approved_by text,
      first_approved_at timestamp with time zone,
      second_approved_by text,
      second_approved_at timestamp with time zone,
      rejected_by text,
      rejected_at timestamp with time zone,
      rejection_reason text,
      paid_at timestamp with time zone,
      journal_entry_id text,
      resolution_reference text,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Month-end close checklist. Standard tasks are seeded per accounting
    // period on first view; sign-off requires period.close.
    // status: open | done | na
    name: "period_close_tasks",
    ddl: `CREATE TABLE IF NOT EXISTS period_close_tasks (
      id text PRIMARY KEY,
      accounting_period_id text NOT NULL,
      task_key text NOT NULL,
      label text NOT NULL,
      sort_order integer DEFAULT 0 NOT NULL,
      status text DEFAULT 'open' NOT NULL,
      completed_by text,
      completed_at timestamp with time zone,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT period_close_tasks_key UNIQUE (accounting_period_id, task_key)
    )`,
  },
  {
    // Item-level prepaid amortization / fixed-asset depreciation schedule.
    // kind: prepaid | fixed_asset. Straight-line over `months` from
    // start_date; monthly JEs debit target (expense) and credit source
    // (prepaid asset / accumulated depreciation).
    name: "amortization_schedules",
    ddl: `CREATE TABLE IF NOT EXISTS amortization_schedules (
      id text PRIMARY KEY,
      kind text NOT NULL,
      name text NOT NULL,
      source_account_id text NOT NULL,
      target_account_id text NOT NULL,
      firm_entity_id text,
      total_cost numeric(15,2) NOT NULL,
      residual_value numeric(15,2) DEFAULT 0 NOT NULL,
      start_date date NOT NULL,
      months integer NOT NULL,
      method text DEFAULT 'straight_line' NOT NULL,
      generated_through date,
      is_active boolean DEFAULT true NOT NULL,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // One generated amortization/depreciation month per schedule.
    name: "amortization_entries",
    ddl: `CREATE TABLE IF NOT EXISTS amortization_entries (
      id text PRIMARY KEY,
      schedule_id text NOT NULL,
      period_date date NOT NULL,
      amount numeric(15,2) NOT NULL,
      journal_entry_id text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Saved list-view filters per user per route.
    name: "saved_views",
    ddl: `CREATE TABLE IF NOT EXISTS saved_views (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      route text NOT NULL,
      name text NOT NULL,
      params jsonb NOT NULL,
      is_default boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
  {
    // Collections workbench: notes, calls, reminders, promises-to-pay.
    // kind: note | call | email | promise | reminder
    // status: open | kept | broken | done
    name: "collection_activities",
    ddl: `CREATE TABLE IF NOT EXISTS collection_activities (
      id text PRIMARY KEY,
      customer_id text NOT NULL,
      activity_date date NOT NULL,
      kind text NOT NULL,
      amount numeric(15,2),
      promise_date date,
      status text DEFAULT 'open' NOT NULL,
      owner_user_id text,
      notes text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )`,
  },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  for (const t of TABLES) {
    const exists = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = ${t.name}
      ) AS exists
    `;
    if (exists[0].exists) {
      console.log(`= TABLE ${t.name} (exists)`);
    } else {
      console.log(`+ CREATE TABLE ${t.name}`);
      await sql.unsafe(t.ddl);
    }
  }
  for (const ev of ENUM_VALUES) {
    const stmt = `ALTER TYPE ${ev.enumName} ADD VALUE IF NOT EXISTS '${ev.value}'`;
    console.log(`~ ${stmt}`);
    await sql.unsafe(stmt);
  }
  // Columns whose NOT NULL constraint was relaxed after creation.
  const DROP_NOT_NULL: Array<{ table: string; column: string }> = [
    // GL link optional for client/entity-owned bank accounts.
    { table: "bank_accounts", column: "account_id" },
  ];
  for (const d of DROP_NOT_NULL) {
    const stmt = `ALTER TABLE ${d.table} ALTER COLUMN ${d.column} DROP NOT NULL`;
    console.log(`~ ${stmt}`);
    await sql.unsafe(stmt);
  }
  for (const c of COLUMNS) {
    const exists = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = ${c.table} AND column_name = ${c.column}
      ) AS exists
    `;
    if (exists[0].exists) {
      console.log(`= ${c.table}.${c.column} (exists)`);
      continue;
    }
    const nn = c.notNull ? " NOT NULL" : "";
    const def = c.default ? ` DEFAULT ${c.default}` : "";
    const stmt = `ALTER TABLE ${c.table} ADD COLUMN ${c.column} ${c.type}${def}${nn}`;
    console.log(`+ ${stmt}`);
    await sql.unsafe(stmt);
  }
  await sql.end();
  console.log("Done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
