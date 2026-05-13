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
];

const TABLES = [
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
