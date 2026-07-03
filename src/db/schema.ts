import {
  pgTable,
  pgEnum,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export const currencies = pgTable("currencies", {
  code: text("code").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  decimals: integer("decimals").notNull().default(2),
  isBase: boolean("is_base").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fxRates = pgTable("fx_rates", {
  id: text("id").primaryKey(),
  currencyCode: text("currency_code").notNull(),
  rateDate: date("rate_date").notNull(),
  ratePerBase: numeric("rate_per_base", { precision: 18, scale: 8 }).notNull(),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const entityKindEnum = pgEnum("entity_kind", [
  "llc",
  "trust",
  "scorp",
  "ccorp",
  "partnership",
  "foundation",
  "individual",
  "other",
]);

export const entityStatusEnum = pgEnum("entity_status", [
  "active",
  "pending",
  "dormant",
  "dissolved",
]);

export const assetKindEnum = pgEnum("asset_kind", [
  "real_estate",
  "securities",
  "cash",
  "bank_account",
  "private_equity",
  "art",
  "vehicle",
  "business_interest",
  "intellectual_property",
  "other",
]);

/**
 * Application roles. Coarse-grained — fine-grained scoping happens through
 * the user_entity_access / user_client_access tables. The role drives the
 * `permissions.ts` matrix.
 *   super_admin — unrestricted, including unlocking locked periods
 *   admin       — everything except unlocking locked periods
 *   manager     — approve invoices/bills, view reports; no settings
 *   accountant  — create/edit JEs/invoices/bills; no approvals
 *   viewer      — read-only everywhere
 *   employee    — read-only on own clients/invoices only
 */
export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "manager",
  "accountant",
  "viewer",
  "employee",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** See userRoleEnum. Kept as text in DB to allow forward-compatible role names. */
  role: text("role").notNull().default("viewer"),
  isSuperuser: boolean("is_superuser").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  /** Set on every successful login by the Auth.js authorize() callback. */
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** Per-user dashboard customization: { hidden: string[] }. */
  dashboardPrefs: jsonb("dashboard_prefs"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Per-user entity scoping. If a user has at least one row here, they can
 * only see / act on those entities (subject to accessLevel). If there are
 * NO rows for a user, they see all entities — the admin default.
 *
 * accessLevel "full" → can post/edit; "read_only" → can view only.
 */
export const accessLevelEnum = pgEnum("access_level", ["full", "read_only"]);

export const userEntityAccess = pgTable("user_entity_access", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  entityId: text("entity_id").notNull(),
  accessLevel: accessLevelEnum("access_level").notNull().default("full"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Per-user client scoping. Same shape as userEntityAccess but keyed on
 * customers.id. Used by the "employee" role so each employee only sees
 * the clients they're assigned to.
 */
export const userClientAccess = pgTable("user_client_access", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  customerId: text("customer_id").notNull(),
  accessLevel: accessLevelEnum("access_level").notNull().default("full"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Immutable audit trail. Denormalises user identity at the time of the
 * event so deleting / renaming a user later doesn't rewrite history.
 * Indexed by (timestamp DESC) for the audit log viewer.
 *
 * action examples: "user.login", "user.logout", "user.login_failed",
 *   "journal_entry.create", "invoice.update", "period.close", "csv.export",
 *   "journal_entry.bypass_control_warning"
 */
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  userId: text("user_id"),
  userEmail: text("user_email"),
  userRole: text("user_role"),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  resourceName: text("resource_name"),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),
  subType: text("sub_type"),
  parentId: text("parent_id"),
  currencyCode: text("currency_code").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  normalBalance: text("normal_balance").notNull(),
  /** null = firm-level (global) chart of accounts. Non-null = entity-scoped books. */
  entityId: text("entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fiscalPeriods = pgTable("fiscal_periods", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Monthly period close. A date that falls inside a "closed" period yields a
 * soft warning the user can override (with a reason); a "locked" period
 * hard-blocks any new entry/invoice/bill posting unless a superadmin
 * reopens it. Periods are auto-seeded for the current year + next year
 * the first time `/settings/periods` is loaded.
 */
export const accountingPeriods = pgTable("accounting_periods", {
  id: text("id").primaryKey(),
  /** Human label, e.g. "January 2026". Unique. */
  name: text("name").notNull().unique(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  /** open | closed | locked */
  status: text("status").notNull().default("open"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: text("closed_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey(),
  entryNumber: text("entry_number").notNull().unique(),
  entryDate: date("entry_date").notNull(),
  fiscalPeriodId: text("fiscal_period_id"),
  description: text("description"),
  reference: text("reference"),
  source: text("source").notNull().default("manual"),
  /** draft | posted | void | template */
  status: text("status").notNull().default("draft"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  postedBy: text("posted_by"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  createdBy: text("created_by"),
  /** Legacy: client-entity tag. Reserved; not used for scoping anymore. */
  entityId: text("entity_id"),
  /** Which of our firm's corporate entities issued this entry. */
  firmEntityId: text("firm_entity_id"),
  /**
   * Set to true when the user explicitly confirmed past a controlled-account
   * posting warning (direct posting to AR/AP/Cash). Creates an audit trail
   * for entries that bypass the recommended invoice/bill/bank-txn flows.
   */
  bypassControlWarning: boolean("bypass_control_warning").notNull().default(false),
  /** Reason given when posting into a soft-closed accounting period. */
  periodOverrideReason: text("period_override_reason"),
  /**
   * When set, this JE is an elimination entry (consolidation adjustment).
   * Points back to one of the source intercompany JEs it eliminates; we
   * filter eliminations OUT of single-entity scoped views but INCLUDE them
   * at the firm-level consolidated view. Self-FK → journal_entries.id.
   */
  eliminationEntryId: text("elimination_entry_id"),
  /**
   * Recurring templates. When `isTemplate` is true, the entry is a
   * blueprint — it never appears in the ledger and its status is
   * always "template". Generated entries point back here via
   * `recurringParentId` and start as drafts dated `recurringNextDate`.
   */
  isTemplate: boolean("is_template").notNull().default(false),
  /** monthly | quarterly | annually | custom */
  recurringFrequency: text("recurring_frequency"),
  /** Day of month (1-28) on which generated entries are dated. */
  recurringDayOfMonth: integer("recurring_day_of_month"),
  /** Next entry-date to use when the user generates from this template. */
  recurringNextDate: date("recurring_next_date"),
  /** Optional cap; after this date no further entries are generated. */
  recurringEndDate: date("recurring_end_date"),
  /** Set on generated entries — points back to the source template. */
  recurringParentId: text("recurring_parent_id"),
  /**
   * Foreign-currency snapshot. "1 base currency = fx_rate native units"
   * (same convention as fx_rates.rate_per_base). NULL = document is in
   * base currency / no conversion needed. Base amount = native / fx_rate.
   */
  fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
  /**
   * Maker-checker approval. Status machine grows to:
   *   draft → pending_approval → approved → posted.
   * The submitter can't be the approver (enforced in mutations).
   */
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedBy: text("submitted_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  approvalRejectionReason: text("approval_rejection_reason"),
  /**
   * Auto-reversing accrual: posting also creates a mirrored entry dated
   * day 1 of the next open period; reversalEntryId links to it.
   */
  autoReverse: boolean("auto_reverse").notNull().default(false),
  reversalEntryId: text("reversal_entry_id"),
  /**
   * Year-end closing entries zero P&L into retained earnings. Excluded
   * from income-statement queries, included in balance sheets.
   */
  isClosingEntry: boolean("is_closing_entry").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const journalLines = pgTable(
  "journal_lines",
  {
    id: text("id").primaryKey(),
    journalEntryId: text("journal_entry_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    accountId: text("account_id").notNull(),
    description: text("description"),
    debit: numeric("debit", { precision: 15, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 15, scale: 2 }).notNull().default("0"),
    entityId: text("entity_id"),
    firmEntityId: text("firm_entity_id"),
    /**
     * If set, marks this line as an intercompany leg and identifies the
     * firm-entity (office) on the other side of the transaction. Soft FK
     * → offices.id. Used by the intercompany report and elimination
     * generator to net out Due-From / Due-To balances on the firm-level
     * consolidated view.
     */
    intercompanyCounterpartEntityId: text("intercompany_counterpart_entity_id"),
    /**
     * Open-ended slicers (department, project, cost center, ...). Stored
     * as `{ "department": "<dim-value-id>", "project": "..." }`. Keys map
     * to dimensions.key; values map to dimension_values.id.
     */
    dimensions: jsonb("dimensions").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    debitOrCredit: check(
      "debit_or_credit",
      sql`(${t.debit} > 0 AND ${t.credit} = 0) OR (${t.debit} = 0 AND ${t.credit} > 0)`,
    ),
  }),
);

/**
 * Firm corporate entities. We bill clients FROM one of these (e.g.
 * Thistlewood US LLC, Cayman trust co, Europe SARL). The `entityScope`
 * cookie picks one to filter all journal entries / invoices / reports.
 *
 * Kept as `offices` for table name to avoid a destructive migration.
 */
export const offices = pgTable("offices", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  currencyCode: text("currency_code").notNull().default("USD"),
  /** llc | trust_company | sarl | etc. */
  kind: text("kind"),
  jurisdiction: text("jurisdiction"),
  ein: text("ein"),
  registrationNumber: text("registration_number"),
  formationDate: date("formation_date"),
  /** Optional region (e.g. "North America", "Caribbean"). */
  regionId: text("region_id"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Office grouping: regions + region groups ----------

/**
 * Top-level grouping of regions (e.g. "Americas", "EMEA", "APAC"). Both
 * the group level and the region level are easy to change — see the
 * /regions page.
 */
export const regionGroups = pgTable("region_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const regions = pgTable("regions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  groupId: text("group_id"), // FK -> region_groups (soft FK)
  notes: text("notes"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Dimensions (department / project / cost center / ...) ----------

/**
 * A dimension is an arbitrary slicer attached to journal/invoice/bill lines
 * via the line's `dimensions` JSONB. The `key` is the JSONB key
 * (e.g. "department") and `label` is the human-readable name. Hierarchy
 * lives on `dimension_values.parent_id`.
 */
export const dimensions = pgTable("dimensions", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dimensionValues = pgTable("dimension_values", {
  id: text("id").primaryKey(),
  dimensionId: text("dimension_id").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  parentId: text("parent_id"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Lookups (user-editable enums) ----------

export const lookupTables = pgTable("lookup_tables", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const lookupValues = pgTable("lookup_values", {
  id: text("id").primaryKey(),
  tableKey: text("table_key").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Custom fields ----------

export const customFieldRecordTypeEnum = pgEnum("custom_field_record_type", [
  "entity",
  "contact",
  "asset",
  "bank_account",
]);

export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "number",
  "date",
  "boolean",
  "select",
]);

export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: text("id").primaryKey(),
  recordType: customFieldRecordTypeEnum("record_type").notNull(),
  fieldKey: text("field_key").notNull(),
  label: text("label").notNull(),
  fieldType: customFieldTypeEnum("field_type").notNull(),
  options: jsonb("options"),
  sortOrder: integer("sort_order").notNull().default(0),
  isRequired: boolean("is_required").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  helpText: text("help_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Attachments ----------

export const attachmentRecordTypeEnum = pgEnum("attachment_record_type", [
  "journal_entry",
  "invoice",
  "bill",
  "contact",
  "entity",
  "asset",
  "bank_account",
  "fee",
  "time_entry",
  "other",
]);

export const attachments = pgTable("attachments", {
  id: text("id").primaryKey(),
  recordType: attachmentRecordTypeEnum("record_type").notNull(),
  recordId: text("record_id").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  fileUrl: text("file_url").notNull(),
  blobPathname: text("blob_pathname"),
  uploadedBy: text("uploaded_by"),
  notes: text("notes"),
  documentType: text("document_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const customFieldValues = pgTable("custom_field_values", {
  id: text("id").primaryKey(),
  definitionId: text("definition_id").notNull(),
  recordId: text("record_id").notNull(),
  valueText: text("value_text"),
  valueNumber: numeric("value_number", { precision: 18, scale: 4 }),
  valueDate: date("value_date"),
  valueBoolean: boolean("value_boolean"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const priceLists = pgTable("price_lists", {
  id: text("id").primaryKey(),
  officeId: text("office_id").notNull(),
  name: text("name").notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  effectiveDate: date("effective_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isCurrent: boolean("is_current").notNull().default(false),
  parentVersionId: text("parent_version_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const priceListItemTypeEnum = pgEnum("price_list_item_type", [
  "entity_fee",
  "time_rate",
  "service",
]);

export const priceListEntries = pgTable("price_list_entries", {
  id: text("id").primaryKey(),
  priceListId: text("price_list_id").notNull(),
  itemType: priceListItemTypeEnum("item_type").notNull(),
  itemKey: text("item_key").notNull(),
  label: text("label").notNull(),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull(),
  includedQuantity: numeric("included_quantity", { precision: 8, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contactKindEnum = pgEnum("contact_kind", [
  "individual",
  "organization",
]);

export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: contactKindEnum("kind").notNull().default("organization"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  isClient: boolean("is_client").notNull().default(false),
  isVendor: boolean("is_vendor").notNull().default(false),
  isEmployee: boolean("is_employee").notNull().default(false),
  isIntermediary: boolean("is_intermediary").notNull().default(false),
  /** Beneficiary register: eligible recipients of entity distributions. */
  isBeneficiary: boolean("is_beneficiary").notNull().default(false),
  customerId: text("customer_id"),
  vendorId: text("vendor_id"),
  userId: text("user_id"),
  isActive: boolean("is_active").notNull().default(true),
  /** Raw text extracted by Claude Haiku OCR. Indexed by global search. */
  ocrText: text("ocr_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contactLinkRefTypeEnum = pgEnum("contact_link_ref_type", [
  "entity",
  "bank_account",
  "invoice",
  "bill",
  "asset",
]);

export const contactLinks = pgTable("contact_links", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  refType: contactLinkRefTypeEnum("ref_type").notNull(),
  refId: text("ref_id").notNull(),
  role: text("role"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  email: text("email"),
  phone: text("phone"),
  billingAddress: text("billing_address"),
  paymentTerms: integer("payment_terms").notNull().default(30),
  // The user (employee) assigned as the primary contact for this client.
  // Used by the invoice approval workflow: after CFO approval, the assigned
  // user must approve the invoice before it transitions to "sent".
  assignedUserId: text("assigned_user_id"),
  /** Optional region (e.g. "North America"). Soft FK → regions.id. */
  regionId: text("region_id"),
  /** Default sales-tax rate as a decimal (0.08875 = 8.875%). 0 means
   *  "no tax." 5 decimals so 3-decimal-percent rates (e.g. NYC 8.875%
   *  or LA Metro 9.5%) store without rounding. Snapshotted onto each
   *  invoice at create time so historical totals don't drift if the
   *  rate later changes. */
  taxRate: numeric("tax_rate", { precision: 6, scale: 5 }).notNull().default("0"),
  /** Hard override: when true, every invoice for this client gets
   *  tax_amount=0 regardless of rate. */
  taxExempt: boolean("tax_exempt").notNull().default(false),
  /** KYC/AML: not_started | in_progress | verified (overdue derived from
   *  kycNextReviewDate < today). */
  kycStatus: text("kyc_status").notNull().default("not_started"),
  /** low | medium | high */
  riskRating: text("risk_rating"),
  pepFlag: boolean("pep_flag").notNull().default(false),
  sanctionsCheckedAt: timestamp("sanctions_checked_at", { withTimezone: true }),
  kycNextReviewDate: date("kyc_next_review_date"),
  kycNotes: text("kyc_notes"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const entities = pgTable("entities", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  clientId: text("client_id").notNull(),
  kind: entityKindEnum("kind").notNull(),
  jurisdiction: text("jurisdiction"),
  formationDate: date("formation_date"),
  status: entityStatusEnum("status").notNull().default("active"),
  ein: text("ein"),
  /** Corporate registration / filing number (state SOS, jurisdiction-specific). */
  registrationNumber: text("registration_number"),
  notes: text("notes"),
  currencyCode: text("currency_code").notNull().default("USD"),
  /** Optional region (e.g. "North America"). Soft FK → regions.id. */
  regionId: text("region_id"),
  /** Client's beneficial ownership of this entity as a percent (0–100).
   *  NULL = unspecified (treat as 100% for rollups). Decimal so 33.33 works. */
  ownershipPercent: numeric("ownership_percent", { precision: 5, scale: 2 }),
  /** KYC/AML — same vocabulary as customers.kycStatus / riskRating. */
  kycStatus: text("kyc_status").notNull().default("not_started"),
  riskRating: text("risk_rating"),
  pepFlag: boolean("pep_flag").notNull().default(false),
  sanctionsCheckedAt: timestamp("sanctions_checked_at", { withTimezone: true }),
  kycNextReviewDate: date("kyc_next_review_date"),
  kycNotes: text("kyc_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const employeeRates = pgTable("employee_rates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  billableRate: numeric("billable_rate", { precision: 10, scale: 2 }).notNull(),
  costRate: numeric("cost_rate", { precision: 10, scale: 2 }),
  effectiveDate: date("effective_date").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const timeEntries = pgTable("time_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  entryDate: date("entry_date").notNull(),
  durationHours: numeric("duration_hours", { precision: 6, scale: 2 }).notNull(),
  description: text("description").notNull(),
  clientId: text("client_id"),
  entityId: text("entity_id"),
  /** Optional link to the entity service this time was performed against. */
  entityFeeId: text("entity_fee_id"),
  taskType: text("task_type"),
  isBillable: boolean("is_billable").notNull().default(true),
  rateAtLog: numeric("rate_at_log", { precision: 10, scale: 2 }),
  invoiceId: text("invoice_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const feeSchedules = pgTable("fee_schedules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  entityKind: entityKindEnum("entity_kind").notNull(),
  annualFee: numeric("annual_fee", { precision: 15, scale: 2 }).notNull(),
  includedHours: numeric("included_hours", { precision: 8, scale: 2 }).notNull(),
  applicableYear: integer("applicable_year"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const entityFeeStatusEnum = pgEnum("entity_fee_status", [
  "draft",
  "active",
  "billed",
  "paid",
  "void",
]);

/**
 * Recurring entity service. The annual fee is the ANNUAL commitment;
 * billing frequency controls how often we invoice for it. Per-period
 * amount can override the derived annual_fee / period_count.
 */
export const entityFees = pgTable("entity_fees", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  billingYear: integer("billing_year").notNull(),
  feeScheduleId: text("fee_schedule_id"),
  annualFee: numeric("annual_fee", { precision: 15, scale: 2 }).notNull(),
  includedHours: numeric("included_hours", { precision: 8, scale: 2 }).notNull(),
  status: entityFeeStatusEnum("status").notNull().default("draft"),
  invoiceId: text("invoice_id"),
  notes: text("notes"),
  /** monthly | quarterly | semiannual | annual | one_time */
  frequency: text("frequency").notNull().default("annual"),
  /** Service coverage window. startDate defaults to entity.formation_date. */
  startDate: date("start_date"),
  endDate: date("end_date"),
  /** Billing schedule: e.g. "bill every March" → billingMonth=3. */
  billingMonth: integer("billing_month"),
  billingDay: integer("billing_day"),
  nextBillingDate: date("next_billing_date"),
  lastBilledDate: date("last_billed_date"),
  /** Amount per billing period. NULL → derived from annualFee / frequency. */
  perPeriodAmount: numeric("per_period_amount", { precision: 15, scale: 2 }),
  /** Opt-in: invoices generated from this fee defer revenue over the
   *  fee's coverage window (startDate..endDate). */
  deferRevenue: boolean("defer_revenue").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Scheduled recurring payments (rent, payroll, taxes, etc.) — used by the
 * cash forecast to project outflows.
 */
export const recurringPayments = pgTable("recurring_payments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  /** weekly | biweekly | monthly | quarterly | semiannual | annual */
  frequency: text("frequency").notNull(),
  nextPaymentDate: date("next_payment_date").notNull(),
  expenseAccountId: text("expense_account_id").notNull(),
  vendorId: text("vendor_id"),
  bankAccountId: text("bank_account_id"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Many-to-many: which users (employees) are assigned to which client.
 * Replaces customers.assigned_user_id with first-class multi-assign.
 * Anyone with can_approve=true can grant the "assigned approval" on
 * invoices for this customer.
 */
export const customerAssignments = pgTable("customer_assignments", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  userId: text("user_id").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  canApprove: boolean("can_approve").notNull().default(true),
  role: text("role"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Account-level budget rows. month=NULL means annual budget; otherwise the
 * row applies to that specific month within fiscalYear.
 */
export const budgets = pgTable("budgets", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  month: integer("month"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Per-account variance explanations for the Variance Analysis report.
 * One note per (fiscal_year, month, mode, compare, account). AI writes the
 * default (source='ai'); accountant edits flip source to 'user' and are
 * never overwritten by regeneration.
 */
export const varianceNotes = pgTable("variance_notes", {
  id: text("id").primaryKey(),
  fiscalYear: integer("fiscal_year").notNull(),
  /** Report month 1–12 (for YTD mode: the through-month). */
  month: integer("month").notNull(),
  /** 'monthly' | 'ytd' */
  mode: text("mode").notNull(),
  /** 'budget' | 'prior_year' */
  compare: text("compare").notNull(),
  accountId: text("account_id").notNull(),
  note: text("note").notNull(),
  /** 'ai' | 'user' */
  source: text("source").notNull().default("ai"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: assetKindEnum("kind").notNull(),
  /**
   * Ownership chain: client → entity → asset.
   * - `entityId` set → asset is held inside that entity.
   * - `entityId` null + `clientId` set → asset is directly held by client.
   * - At least one of the two must be set in application logic.
   */
  entityId: text("entity_id"),
  clientId: text("client_id"),
  currencyCode: text("currency_code").notNull().default("USD"),
  externalRef: text("external_ref"),
  acquiredDate: date("acquired_date"),
  /** Date the current carrying value is as-of. Used by the AUA report's
   *  "as of date" filter to pick the most recent valuation ≤ the selected
   *  date. Independent from asset_value_snapshots.snapshot_date so an
   *  asset can carry a default valuation date without a snapshot row. */
  valuationDate: date("valuation_date"),
  /** Kind-specific fields (address/APN for real estate, VIN for vehicles,
   *  …) keyed by src/lib/asset-fields.ts. Defaults to {}. */
  details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
  /** For kind = bank_account: the bank_accounts row this asset wraps —
   *  account number, ABA, and signers live there. Soft FK. */
  bankAccountId: text("bank_account_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assetValueSnapshots = pgTable("asset_value_snapshots", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  value: numeric("value", { precision: 18, scale: 2 }).notNull(),
  currencyCode: text("currency_code").notNull().default("USD"),
  source: text("source"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  /**
   * 'invoice' | 'credit_memo'. Credit memos store NEGATIVE
   * subtotal/total/balanceDue so every AR sum stays correct without
   * kind-awareness; their posting JE reverses the invoice JE
   * (Dr revenue / Cr AR). Applied to open invoices via credit_applications.
   */
  kind: text("kind").notNull().default("invoice"),
  customerId: text("customer_id").notNull(),
  entityId: text("entity_id"),
  clientId: text("client_id"),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date").notNull(),
  // Status state machine. The approval-workflow values sit between draft and
  // sent: a draft enters CFO review, then the assigned employee, then posts.
  //   draft → pending_cfo → pending_assigned → sent → partial → paid
  //   any non-terminal state → void
  status: text("status").notNull().default("draft"),
  cfoApprovedAt: timestamp("cfo_approved_at", { withTimezone: true }),
  cfoApprovedBy: text("cfo_approved_by"),
  assignedApprovedAt: timestamp("assigned_approved_at", { withTimezone: true }),
  assignedApprovedBy: text("assigned_approved_by"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedBy: text("rejected_by"),
  rejectionReason: text("rejection_reason"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  /** Snapshot of customer.taxRate at create time (decimal, 5 places). */
  taxRate: numeric("tax_rate", { precision: 6, scale: 5 }).notNull().default("0"),
  /** Snapshot of customer.taxExempt at create time. When true, taxAmount = 0. */
  taxExempt: boolean("tax_exempt").notNull().default(false),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  balanceDue: numeric("balance_due", { precision: 15, scale: 2 }).notNull().default("0"),
  currencyCode: text("currency_code").notNull().default("USD"),
  /** Employee-updatable estimate of when this invoice will actually be paid.
   *  Drives the cash forecast page. NULL → forecast falls back to dueDate. */
  expectedPaymentDate: date("expected_payment_date"),
  notes: text("notes"),
  /** Raw text extracted by Claude Haiku OCR. Indexed by global search. */
  ocrText: text("ocr_text"),
  journalEntryId: text("journal_entry_id"),
  /** Which of our firm's corporate entities issued this invoice. */
  firmEntityId: text("firm_entity_id"),
  /** Reason given when posting into a soft-closed accounting period. */
  periodOverrideReason: text("period_override_reason"),
  /**
   * Recurring invoice templates. When `isTemplate` is true, the row is a
   * blueprint — it never appears in AR and its status is always "template".
   * Generated invoices point back here via `recurringParentId` and start as
   * drafts dated `recurringNextDate`.
   */
  isTemplate: boolean("is_template").notNull().default(false),
  /** weekly | biweekly | monthly | quarterly | annually */
  recurringFrequency: text("recurring_frequency"),
  /** Day of month (1-28) on which generated invoices are dated. */
  recurringDayOfMonth: integer("recurring_day_of_month"),
  /** Next invoice-date to use when the user generates from this template. */
  recurringNextDate: date("recurring_next_date"),
  /** Optional cap; after this date no further invoices are generated. */
  recurringEndDate: date("recurring_end_date"),
  /** Set on generated invoices — points back to the source template. */
  recurringParentId: text("recurring_parent_id"),
  /** Auto-set on generated invoices: start of the period being billed. */
  billingPeriodStart: date("billing_period_start"),
  /** Auto-set on generated invoices: end of the period being billed. */
  billingPeriodEnd: date("billing_period_end"),
  /**
   * Foreign-currency snapshot. "1 base currency = fx_rate native units".
   * NULL when the invoice is in base currency / no conversion needed.
   */
  fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
  /** Bad-debt write-off: status → 'written_off', JE Dr bad debt / Cr AR. */
  writtenOffAt: timestamp("written_off_at", { withTimezone: true }),
  writtenOffBy: text("written_off_by"),
  writeoffReason: text("writeoff_reason"),
  writeoffJournalEntryId: text("writeoff_journal_entry_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceLines = pgTable("invoice_lines", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  lineNumber: integer("line_number").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  accountId: text("account_id").notNull(),
  /** Per-line VAT/GST coding. Soft FK → tax_codes.id. NULL = legacy
   *  invoice-level rate applies. */
  taxCodeId: text("tax_code_id"),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  /** Opt-in deferred revenue: defer this line over
   *  [deferralStart, deferralEnd] via a recognition schedule at posting. */
  deferRevenue: boolean("defer_revenue").notNull().default(false),
  deferralStart: date("deferral_start"),
  deferralEnd: date("deferral_end"),
  dimensions: jsonb("dimensions").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  paymentTerms: integer("payment_terms").notNull().default(30),
  defaultExpenseAccountId: text("default_expense_account_id"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  /**
   * Vendor invoice numbering convention. The prefix is e.g. "INV-", the
   * pattern uses placeholders (YYYY = 4-digit year, YY = 2-digit year,
   * MM = month, DD = day, #### = sequential, width preserved). `lastUsed`
   * stores the most recent vendor invoice number we recorded; the next
   * suggestion just increments its trailing digit run when present.
   */
  invoiceNumberPrefix: text("invoice_number_prefix"),
  invoiceNumberPattern: text("invoice_number_pattern"),
  invoiceNumberLastUsed: text("invoice_number_last_used"),
  /**
   * Vendor approval state. Bills against pending/rejected vendors can be
   * drafted but not approved or paid until the vendor is approved. New
   * vendors created by hand default to "approved" (someone with bill.create
   * is intentionally adding them); vendors auto-created by the OCR flow
   * default to "pending" so a human reviews them before money moves.
   */
  approvalStatus: text("approval_status").notNull().default("approved"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedByUserId: text("approved_by_user_id"),
  approvalNotes: text("approval_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bills = pgTable("bills", {
  id: text("id").primaryKey(),
  billNumber: text("bill_number").notNull(),
  /** 'bill' | 'vendor_credit'. Vendor credits store NEGATIVE totals
   *  (mirror of invoices.kind) and apply via bill_credit_applications. */
  kind: text("kind").notNull().default("bill"),
  vendorId: text("vendor_id").notNull(),
  /**
   * The vendor's own invoice number from their bill to us (e.g. "INV-2026-0042").
   * Separate from `billNumber` which is our internal sequence. We warn (but
   * don't block) if a duplicate (vendor_id, vendor_invoice_number) pair is
   * entered, so the same vendor invoice isn't accidentally recorded twice.
   */
  vendorInvoiceNumber: text("vendor_invoice_number"),
  billDate: date("bill_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull().default("draft"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  balanceDue: numeric("balance_due", { precision: 15, scale: 2 }).notNull().default("0"),
  currencyCode: text("currency_code").notNull().default("USD"),
  notes: text("notes"),
  /** Raw text extracted by Claude Haiku OCR. Indexed by global search. */
  ocrText: text("ocr_text"),
  journalEntryId: text("journal_entry_id"),
  /** Optional client this bill is on-behalf-of. Soft FK → customers.id. */
  clientId: text("client_id"),
  /** Optional entity this bill is on-behalf-of. Soft FK → entities.id. */
  entityId: text("entity_id"),
  // Chargeback (rebill to client / entity) — see scripts/sync-schema.ts.
  chargebackClientId: text("chargeback_client_id"),
  chargebackEntityId: text("chargeback_entity_id"),
  /** True when the rebill splits per line: each line's client_id (or
   *  entity_id, per chargeback_split_by) says who pays for it (lines with
   *  no allocation aren't rebilled). Mutually exclusive with
   *  chargeback_client_id / chargeback_entity_id. */
  chargebackSplit: boolean("chargeback_split").notNull().default(false),
  /** 'client' | 'entity' — which per-line column drives a split rebill.
   *  NULL on legacy split rows = 'client'. */
  chargebackSplitBy: text("chargeback_split_by"),
  chargebackType: text("chargeback_type"),
  markupPct: numeric("markup_pct", { precision: 7, scale: 4 }),
  rebillAmount: numeric("rebill_amount", { precision: 15, scale: 2 }),
  chargebackInvoiceId: text("chargeback_invoice_id"),
  chargebackNotes: text("chargeback_notes"),
  /** Reason given when approving into a soft-closed accounting period. */
  periodOverrideReason: text("period_override_reason"),
  /**
   * Foreign-currency snapshot. "1 base currency = fx_rate native units".
   * NULL when the bill is in base currency / no conversion needed.
   */
  fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const billLines = pgTable("bill_lines", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull(),
  lineNumber: integer("line_number").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  accountId: text("account_id").notNull(),
  /** Per-line input-VAT coding. Soft FK → tax_codes.id. */
  taxCodeId: text("tax_code_id"),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  /** Optional per-line client allocation. */
  clientId: text("client_id"),
  /** Optional per-line entity allocation. */
  entityId: text("entity_id"),
  /** For split chargebacks: the invoice that rebilled THIS line. A split
   *  bill is fully billed back once every client-assigned line is stamped. */
  chargebackInvoiceId: text("chargeback_invoice_id"),
  dimensions: jsonb("dimensions").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** GL account link. Required for FIRM accounts (reconciliation / cash
   *  forecast); optional for client/entity-owned accounts, which live on
   *  the client's side and don't post to the firm ledger. */
  accountId: text("account_id"),
  institution: text("institution"),
  /** checking | savings | money_market | custody | brokerage | other */
  accountType: text("account_type"),
  /** SWIFT/BIC for international wires. */
  swiftBic: text("swift_bic"),
  iban: text("iban"),
  bankAddress: text("bank_address"),
  /** ISO country of the bank branch. */
  bankCountry: text("bank_country"),
  /** Full account number. NEVER render this raw — display via
   *  maskAccountNumber() (····1234). last_four stays derived for lists. */
  accountNumber: text("account_number"),
  /** ABA routing number (not secret — banks print it on every check). */
  routingNumber: text("routing_number"),
  lastFour: text("last_four"),
  currencyCode: text("currency_code").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  entityId: text("entity_id"),
  clientId: text("client_id"),
  currentBalance: numeric("current_balance", { precision: 15, scale: 2 }),
  balanceAsOf: date("balance_as_of"),
  /** Client's beneficial ownership of this account as a percent (0–100).
   *  NULL = unspecified. Useful for joint / partially-owned accounts. */
  ownershipPercent: numeric("ownership_percent", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const signingAuthorityEnum = pgEnum("signing_authority", [
  "sole",
  "joint",
  "limited",
  "view_only",
]);

export const bankAccountSigners = pgTable("bank_account_signers", {
  id: text("id").primaryKey(),
  bankAccountId: text("bank_account_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  title: text("title"),
  authority: signingAuthorityEnum("authority").notNull().default("joint"),
  isPrimary: boolean("is_primary").notNull().default(false),
  addedDate: date("added_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bankTransactions = pgTable("bank_transactions", {
  id: text("id").primaryKey(),
  bankAccountId: text("bank_account_id").notNull(),
  transactionDate: date("transaction_date").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  reference: text("reference"),
  isReconciled: boolean("is_reconciled").notNull().default(false),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  journalEntryId: text("journal_entry_id"),
  /** 'system' = payment posting; 'import' = statement CSV; 'manual' = keyed by hand. */
  source: text("source").notNull().default("system"),
  /** Set on imported rows — points at the statement_imports batch. */
  statementImportId: text("statement_import_id"),
  /** Set when cleared inside a reconciliation session. */
  reconciliationSessionId: text("reconciliation_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  paymentNumber: text("payment_number").notNull().unique(),
  paymentDate: date("payment_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  reference: text("reference"),
  direction: text("direction").notNull(),
  customerId: text("customer_id"),
  vendorId: text("vendor_id"),
  bankAccountId: text("bank_account_id"),
  journalEntryId: text("journal_entry_id"),
  /**
   * Funds on account: the portion not yet applied to an invoice. Held as
   * a client-deposit liability until applied via payment_allocations.
   */
  unappliedAmount: numeric("unapplied_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  firmEntityId: text("firm_entity_id"),
  currencyCode: text("currency_code").notNull().default("USD"),
  /** 'standard' | 'retainer' — retainers land wholly unapplied on receipt. */
  kind: text("kind").notNull().default("standard"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentAllocations = pgTable("payment_allocations", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id").notNull(),
  invoiceId: text("invoice_id"),
  billId: text("bill_id"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Append-only notes attached to an invoice. Notes are never edited or
 * deleted from the UI — each save creates a new row, so the log doubles
 * as an audit trail of who said what about an open A/R balance.
 */
export const invoiceNotes = pgTable("invoice_notes", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  note: text("note").notNull(),
  /** Author display name (denormalized so notes survive user renames). */
  authorName: text("author_name").notNull(),
  /** Optional FK back to the user record for traceability. */
  authorUserId: text("author_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Banking: statement import + reconciliation sessions ----------

/** One row per bank-statement CSV import — provenance + dedupe stats. */
export const statementImports = pgTable("statement_imports", {
  id: text("id").primaryKey(),
  bankAccountId: text("bank_account_id").notNull(),
  fileName: text("file_name").notNull(),
  importedBy: text("imported_by"),
  rowCount: integer("row_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A month-end bank reconciliation working session. Cleared transactions
 * point back via bank_transactions.reconciliation_session_id. Completing
 * a session requires book balance − outstanding = statement ending balance.
 * status: in_progress | completed | void
 */
export const reconciliationSessions = pgTable("reconciliation_sessions", {
  id: text("id").primaryKey(),
  bankAccountId: text("bank_account_id").notNull(),
  statementDate: date("statement_date").notNull(),
  statementEndingBalance: numeric("statement_ending_balance", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull().default("in_progress"),
  startedBy: text("started_by"),
  completedBy: text("completed_by"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Dual-control payment release ----------

/**
 * A prepared batch of bill payments. Prepared by one user (draft →
 * pending_release); a DIFFERENT user with payment.release executes it.
 * status: draft | pending_release | released | void
 */
export const paymentRuns = pgTable("payment_runs", {
  id: text("id").primaryKey(),
  runNumber: text("run_number").notNull().unique(),
  bankAccountId: text("bank_account_id").notNull(),
  status: text("status").notNull().default("draft"),
  preparedBy: text("prepared_by"),
  preparedAt: timestamp("prepared_at", { withTimezone: true }),
  releasedBy: text("released_by"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  itemCount: integer("item_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One bill payment inside a payment run. status: pending | paid | skipped */
export const paymentRunItems = pgTable("payment_run_items", {
  id: text("id").primaryKey(),
  paymentRunId: text("payment_run_id").notNull(),
  billId: text("bill_id").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  journalEntryId: text("journal_entry_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Year-end close ----------

/**
 * One close per (fiscal_year, firm_entity). Points at the closing JE that
 * moves net income into retained earnings. status: closed | reopened
 */
export const yearEndCloses = pgTable("year_end_closes", {
  id: text("id").primaryKey(),
  fiscalYear: integer("fiscal_year").notNull(),
  firmEntityId: text("firm_entity_id"),
  journalEntryId: text("journal_entry_id"),
  retainedEarningsAccountId: text("retained_earnings_account_id").notNull(),
  netIncome: numeric("net_income", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull().default("closed"),
  closedBy: text("closed_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }).defaultNow().notNull(),
  reopenedBy: text("reopened_by"),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  notes: text("notes"),
});

// ---------- Compliance calendar ----------

/**
 * Statutory filings / renewals per client entity.
 * kind: annual_return | license_renewal | agent_renewal | fatca | crs |
 *       tax_return | economic_substance | other
 * recurrence: none | monthly | quarterly | annual | biennial
 * status: pending | in_progress | filed | waived (overdue derived)
 */
export const entityFilings = pgTable("entity_filings", {
  id: text("id").primaryKey(),
  entityId: text("entity_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  jurisdiction: text("jurisdiction"),
  dueDate: date("due_date").notNull(),
  recurrence: text("recurrence").notNull().default("none"),
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: text("completed_by"),
  ownerUserId: text("owner_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- KYC / AML reviews ----------

/**
 * Periodic due-diligence review log. subject_type: customer | entity.
 * outcome: cleared | escalated | refreshed
 */
export const kycReviews = pgTable("kyc_reviews", {
  id: text("id").primaryKey(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  reviewDate: date("review_date").notNull(),
  outcome: text("outcome").notNull(),
  riskRatingAfter: text("risk_rating_after"),
  reviewerUserId: text("reviewer_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- VAT / GST tax codes ----------

/**
 * kind: standard | reduced | zero_rated | exempt | out_of_scope.
 * Zero-rated sales are taxable at 0% (on the VAT return, input VAT
 * recoverable); exempt sales sit outside the VAT net and report
 * separately. rate is decimal (0.15 = 15%).
 */
export const taxCodes = pgTable("tax_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  rate: numeric("rate", { precision: 6, scale: 5 }).notNull().default("0"),
  kind: text("kind").notNull().default("standard"),
  country: text("country"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Credit memo applications ----------

/** Application of an AR credit memo against an open invoice. */
export const creditApplications = pgTable("credit_applications", {
  id: text("id").primaryKey(),
  creditInvoiceId: text("credit_invoice_id").notNull(),
  targetInvoiceId: text("target_invoice_id").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  appliedBy: text("applied_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Application of a vendor credit against an open bill. */
export const billCreditApplications = pgTable("bill_credit_applications", {
  id: text("id").primaryKey(),
  creditBillId: text("credit_bill_id").notNull(),
  targetBillId: text("target_bill_id").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  appliedBy: text("applied_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Deferred revenue (opt-in) ----------

/**
 * One schedule per deferred invoice line. Posting credits
 * deferralAccount; monthly recognition moves straight-line slices to
 * revenueAccount. status: active | complete | cancelled
 */
export const revenueRecognitionSchedules = pgTable("revenue_recognition_schedules", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  invoiceLineId: text("invoice_line_id").notNull(),
  deferralAccountId: text("deferral_account_id").notNull(),
  revenueAccountId: text("revenue_account_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  total: numeric("total", { precision: 15, scale: 2 }).notNull(),
  recognizedAmount: numeric("recognized_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One recognized month per schedule; points at the recognition JE. */
export const revenueRecognitionEntries = pgTable("revenue_recognition_entries", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id").notNull(),
  periodDate: date("period_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  journalEntryId: text("journal_entry_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- FX revaluation ----------

/**
 * Period-end revaluation of open foreign-currency balances: books
 * unrealized gain/loss, auto-reversed next period. details holds the
 * per-currency computation snapshot.
 */
export const fxRevaluations = pgTable("fx_revaluations", {
  id: text("id").primaryKey(),
  revaluationDate: date("revaluation_date").notNull(),
  firmEntityId: text("firm_entity_id"),
  journalEntryId: text("journal_entry_id"),
  reversalEntryId: text("reversal_entry_id"),
  details: jsonb("details"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Distributions ----------

/**
 * Distribution to a beneficiary from a client entity. Dual approval
 * mirrors the bill workflow. journalEntryId is set ONLY when the funding
 * account is a GL-linked firm account — client-account distributions are
 * operational records that never touch the firm ledger.
 * status: requested | first_approved | approved | paid | rejected | void
 */
export const distributions = pgTable("distributions", {
  id: text("id").primaryKey(),
  distributionNumber: text("distribution_number").notNull().unique(),
  entityId: text("entity_id").notNull(),
  beneficiaryContactId: text("beneficiary_contact_id").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currencyCode: text("currency_code").notNull().default("USD"),
  bankAccountId: text("bank_account_id"),
  status: text("status").notNull().default("requested"),
  requestedBy: text("requested_by"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  firstApprovedBy: text("first_approved_by"),
  firstApprovedAt: timestamp("first_approved_at", { withTimezone: true }),
  secondApprovedBy: text("second_approved_by"),
  secondApprovedAt: timestamp("second_approved_at", { withTimezone: true }),
  rejectedBy: text("rejected_by"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  journalEntryId: text("journal_entry_id"),
  resolutionReference: text("resolution_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Month-end close checklist ----------

/**
 * Standard tasks seeded per accounting period on first view; completion
 * requires close.task, sign-off (period close) requires period.close.
 * status: open | done | na
 */
export const periodCloseTasks = pgTable("period_close_tasks", {
  id: text("id").primaryKey(),
  accountingPeriodId: text("accounting_period_id").notNull(),
  taskKey: text("task_key").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("open"),
  completedBy: text("completed_by"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Amortization / depreciation schedules ----------

/**
 * Item-level prepaid amortization / fixed-asset depreciation.
 * kind: prepaid | fixed_asset. Straight-line over `months` from
 * startDate; monthly JEs debit target (expense) and credit source
 * (prepaid asset / accumulated depreciation).
 */
export const amortizationSchedules = pgTable("amortization_schedules", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  sourceAccountId: text("source_account_id").notNull(),
  targetAccountId: text("target_account_id").notNull(),
  firmEntityId: text("firm_entity_id"),
  totalCost: numeric("total_cost", { precision: 15, scale: 2 }).notNull(),
  residualValue: numeric("residual_value", { precision: 15, scale: 2 }).notNull().default("0"),
  startDate: date("start_date").notNull(),
  months: integer("months").notNull(),
  method: text("method").notNull().default("straight_line"),
  generatedThrough: date("generated_through"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One generated amortization/depreciation month per schedule. */
export const amortizationEntries = pgTable("amortization_entries", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id").notNull(),
  periodDate: date("period_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  journalEntryId: text("journal_entry_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Saved list views ----------

/** Saved list-view filters per user per route. params = URL search params. */
export const savedViews = pgTable("saved_views", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  route: text("route").notNull(),
  name: text("name").notNull(),
  params: jsonb("params").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Collections workbench ----------

/**
 * Collections activity per client: notes, calls, reminders,
 * promises-to-pay. kind: note | call | email | promise | reminder.
 * status: open | kept | broken | done
 */
export const collectionActivities = pgTable("collection_activities", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  activityDate: date("activity_date").notNull(),
  kind: text("kind").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  promiseDate: date("promise_date"),
  status: text("status").notNull().default("open"),
  ownerUserId: text("owner_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const activityLog = pgTable("activity_log", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  diff: jsonb("diff"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type FiscalPeriod = typeof fiscalPeriods.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type AssetValueSnapshot = typeof assetValueSnapshots.$inferSelect;
export type BankAccountSigner = typeof bankAccountSigners.$inferSelect;
export type FeeSchedule = typeof feeSchedules.$inferSelect;
export type EntityFee = typeof entityFees.$inferSelect;
export type EmployeeRate = typeof employeeRates.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type ContactLink = typeof contactLinks.$inferSelect;
export type Office = typeof offices.$inferSelect;
export type PriceList = typeof priceLists.$inferSelect;
export type PriceListEntry = typeof priceListEntries.$inferSelect;
export type Currency = typeof currencies.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
export type LookupTable = typeof lookupTables.$inferSelect;
export type LookupValue = typeof lookupValues.$inferSelect;
export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type CustomFieldValue = typeof customFieldValues.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type InvoiceNote = typeof invoiceNotes.$inferSelect;
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type UserEntityAccess = typeof userEntityAccess.$inferSelect;
export type UserClientAccess = typeof userClientAccess.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type StatementImport = typeof statementImports.$inferSelect;
export type ReconciliationSession = typeof reconciliationSessions.$inferSelect;
export type PaymentRun = typeof paymentRuns.$inferSelect;
export type PaymentRunItem = typeof paymentRunItems.$inferSelect;
export type YearEndClose = typeof yearEndCloses.$inferSelect;
export type EntityFiling = typeof entityFilings.$inferSelect;
export type KycReview = typeof kycReviews.$inferSelect;
export type TaxCode = typeof taxCodes.$inferSelect;
export type CreditApplication = typeof creditApplications.$inferSelect;
export type BillCreditApplication = typeof billCreditApplications.$inferSelect;
export type RevenueRecognitionSchedule = typeof revenueRecognitionSchedules.$inferSelect;
export type RevenueRecognitionEntry = typeof revenueRecognitionEntries.$inferSelect;
export type FxRevaluation = typeof fxRevaluations.$inferSelect;
export type Distribution = typeof distributions.$inferSelect;
export type PeriodCloseTask = typeof periodCloseTasks.$inferSelect;
export type AmortizationSchedule = typeof amortizationSchedules.$inferSelect;
export type AmortizationEntry = typeof amortizationEntries.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
export type CollectionActivity = typeof collectionActivities.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
