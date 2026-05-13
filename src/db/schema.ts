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
  "private_equity",
  "art",
  "vehicle",
  "business_interest",
  "intellectual_property",
  "other",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  isSuperuser: boolean("is_superuser").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),
  subType: text("sub_type"),
  parentId: text("parent_id"),
  currencyCode: text("currency_code").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  normalBalance: text("normal_balance").notNull(),
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

export const journalEntries = pgTable("journal_entries", {
  id: text("id").primaryKey(),
  entryNumber: text("entry_number").notNull().unique(),
  entryDate: date("entry_date").notNull(),
  fiscalPeriodId: text("fiscal_period_id"),
  description: text("description"),
  reference: text("reference"),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("draft"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  postedBy: text("posted_by"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  createdBy: text("created_by"),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    debitOrCredit: check(
      "debit_or_credit",
      sql`(${t.debit} > 0 AND ${t.credit} = 0) OR (${t.debit} = 0 AND ${t.credit} > 0)`,
    ),
  }),
);

export const offices = pgTable("offices", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  currencyCode: text("currency_code").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
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
  customerId: text("customer_id"),
  vendorId: text("vendor_id"),
  userId: text("user_id"),
  isActive: boolean("is_active").notNull().default(true),
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
  notes: text("notes"),
  currencyCode: text("currency_code").notNull().default("USD"),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: assetKindEnum("kind").notNull(),
  entityId: text("entity_id").notNull(),
  currencyCode: text("currency_code").notNull().default("USD"),
  externalRef: text("external_ref"),
  acquiredDate: date("acquired_date"),
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
  customerId: text("customer_id").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull().default("draft"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  balanceDue: numeric("balance_due", { precision: 15, scale: 2 }).notNull().default("0"),
  currencyCode: text("currency_code").notNull().default("USD"),
  notes: text("notes"),
  journalEntryId: text("journal_entry_id"),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bills = pgTable("bills", {
  id: text("id").primaryKey(),
  billNumber: text("bill_number").notNull(),
  vendorId: text("vendor_id").notNull(),
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
  journalEntryId: text("journal_entry_id"),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  accountId: text("account_id").notNull(),
  institution: text("institution"),
  lastFour: text("last_four"),
  currencyCode: text("currency_code").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  entityId: text("entity_id"),
  clientId: text("client_id"),
  currentBalance: numeric("current_balance", { precision: 15, scale: 2 }),
  balanceAsOf: date("balance_as_of"),
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
