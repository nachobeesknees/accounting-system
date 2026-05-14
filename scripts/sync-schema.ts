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

const COLUMNS: ColumnSpec[] = [
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
];

const TABLES = [
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
