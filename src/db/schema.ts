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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
