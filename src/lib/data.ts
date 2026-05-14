/**
 * Read-side data access. Drizzle queries against the Postgres database.
 * Returns the same shapes defined in src/lib/types.ts so existing pages
 * keep compiling — assembled types like Invoice/Bill/JournalEntry are
 * built up from their respective parent + lines tables.
 *
 * Every function is async; callers (server components and server actions)
 * await them.
 */

import "server-only";

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { parseAmount, sumDebits, sumCredits } from "./money";
import { getEntityScope } from "./entity-scope";
import type {
  Account,
  AccountType,
  Asset,
  AssetKind,
  AssetValueSnapshot,
  Attachment,
  AttachmentRecordType,
  Bill,
  BillLine,
  BankAccount,
  BankAccountSigner,
  BankTransaction,
  Contact,
  ContactKind,
  ContactLink,
  ContactLinkRefType,
  Currency,
  CustomFieldDefinition,
  CustomFieldRecordType,
  CustomFieldType,
  CustomFieldValue,
  Customer,
  EmployeeRate,
  Entity,
  EntityFee,
  EntityFeeStatus,
  EntityKind,
  EntityStatus,
  FeeSchedule,
  FiscalPeriod,
  FxRate,
  Invoice,
  InvoiceLine,
  JournalEntry,
  JournalEntryStatus,
  JournalLine,
  LookupTable,
  LookupValue,
  Office,
  PriceList,
  PriceListEntry,
  PriceListItemType,
  SigningAuthority,
  TimeEntry,
  User,
  Vendor,
} from "./types";

// --------- Row → type mappers ---------
// Drizzle returns dates as Date objects and date columns as strings (YYYY-MM-DD)
// already; here we just narrow status fields and convert timestamps to ISO.

function isoOrNull(d: Date | null): string | null {
  return d == null ? null : d.toISOString();
}

function mapAccount(r: typeof schema.accounts.$inferSelect): Account {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    accountType: r.accountType as AccountType,
    subType: r.subType,
    normalBalance: r.normalBalance as "debit" | "credit",
    isActive: r.isActive,
    currencyCode: r.currencyCode,
    entityId: r.entityId,
  };
}

function mapPeriod(r: typeof schema.fiscalPeriods.$inferSelect): FiscalPeriod {
  return {
    id: r.id,
    name: r.name,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status as FiscalPeriod["status"],
  };
}

function mapUser(r: typeof schema.users.$inferSelect): User {
  return {
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    role: r.role,
    isSuperuser: r.isSuperuser,
  };
}

function mapEntity(r: typeof schema.entities.$inferSelect): Entity {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    clientId: r.clientId,
    kind: r.kind as EntityKind,
    jurisdiction: r.jurisdiction,
    formationDate: r.formationDate,
    status: r.status as EntityStatus,
    ein: r.ein,
    registrationNumber: r.registrationNumber,
    notes: r.notes,
    currencyCode: r.currencyCode,
    regionId: (r as { regionId?: string | null }).regionId ?? null,
  };
}

function mapCurrency(r: typeof schema.currencies.$inferSelect): Currency {
  return {
    code: r.code,
    symbol: r.symbol,
    name: r.name,
    decimals: r.decimals,
    isBase: r.isBase,
    isActive: r.isActive,
  };
}

function mapFxRate(r: typeof schema.fxRates.$inferSelect): FxRate {
  return {
    id: r.id,
    currencyCode: r.currencyCode,
    rateDate: r.rateDate,
    ratePerBase: r.ratePerBase,
    source: r.source,
    notes: r.notes,
  };
}

function mapAsset(r: typeof schema.assets.$inferSelect): Asset {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as AssetKind,
    entityId: r.entityId,
    clientId: r.clientId,
    currencyCode: r.currencyCode,
    externalRef: r.externalRef,
    acquiredDate: r.acquiredDate,
    notes: r.notes,
  };
}

function mapSnapshot(
  r: typeof schema.assetValueSnapshots.$inferSelect,
): AssetValueSnapshot {
  return {
    id: r.id,
    assetId: r.assetId,
    snapshotDate: r.snapshotDate,
    value: r.value,
    currencyCode: r.currencyCode,
    source: r.source,
    notes: r.notes,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

function mapFeeSchedule(r: typeof schema.feeSchedules.$inferSelect): FeeSchedule {
  return {
    id: r.id,
    name: r.name,
    entityKind: r.entityKind as EntityKind,
    annualFee: r.annualFee,
    includedHours: r.includedHours,
    applicableYear: r.applicableYear,
    isActive: r.isActive,
    notes: r.notes,
  };
}

function mapEmployeeRate(r: typeof schema.employeeRates.$inferSelect): EmployeeRate {
  return {
    id: r.id,
    userId: r.userId,
    role: r.role,
    billableRate: r.billableRate,
    costRate: r.costRate,
    effectiveDate: r.effectiveDate,
    isDefault: r.isDefault,
    notes: r.notes,
  };
}

function mapTimeEntry(r: typeof schema.timeEntries.$inferSelect): TimeEntry {
  return {
    id: r.id,
    userId: r.userId,
    entryDate: r.entryDate,
    durationHours: r.durationHours,
    description: r.description,
    clientId: r.clientId,
    entityId: r.entityId,
    entityFeeId: r.entityFeeId,
    taskType: r.taskType,
    isBillable: r.isBillable,
    rateAtLog: r.rateAtLog,
    invoiceId: r.invoiceId,
    notes: r.notes,
  };
}

function mapEntityFee(r: typeof schema.entityFees.$inferSelect): EntityFee {
  return {
    id: r.id,
    entityId: r.entityId,
    billingYear: r.billingYear,
    feeScheduleId: r.feeScheduleId,
    annualFee: r.annualFee,
    includedHours: r.includedHours,
    status: r.status as EntityFeeStatus,
    invoiceId: r.invoiceId,
    notes: r.notes,
    frequency: (r.frequency ?? "annual") as EntityFee["frequency"],
    startDate: r.startDate,
    endDate: r.endDate,
    billingMonth: r.billingMonth,
    billingDay: r.billingDay,
    nextBillingDate: r.nextBillingDate,
    lastBilledDate: r.lastBilledDate,
    perPeriodAmount: r.perPeriodAmount,
  };
}

function mapRecurringPayment(
  r: typeof schema.recurringPayments.$inferSelect,
): import("./types").RecurringPayment {
  return {
    id: r.id,
    name: r.name,
    amount: r.amount,
    frequency: r.frequency as import("./types").RecurringPaymentFrequency,
    nextPaymentDate: r.nextPaymentDate,
    expenseAccountId: r.expenseAccountId,
    vendorId: r.vendorId,
    bankAccountId: r.bankAccountId,
    isActive: r.isActive,
    notes: r.notes,
  };
}

function mapBudget(r: typeof schema.budgets.$inferSelect): import("./types").Budget {
  return {
    id: r.id,
    accountId: r.accountId,
    fiscalYear: r.fiscalYear,
    month: r.month,
    amount: r.amount,
    notes: r.notes,
  };
}

function mapAttachment(r: typeof schema.attachments.$inferSelect): Attachment {
  return {
    id: r.id,
    recordType: r.recordType as AttachmentRecordType,
    recordId: r.recordId,
    fileName: r.fileName,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    fileUrl: r.fileUrl,
    blobPathname: r.blobPathname,
    uploadedBy: r.uploadedBy,
    notes: r.notes,
    documentType: r.documentType,
    createdAt: r.createdAt.toISOString(),
  };
}

function mapLookupTable(r: typeof schema.lookupTables.$inferSelect): LookupTable {
  return {
    key: r.key,
    label: r.label,
    description: r.description,
    isSystem: r.isSystem,
  };
}

function mapLookupValue(r: typeof schema.lookupValues.$inferSelect): LookupValue {
  return {
    id: r.id,
    tableKey: r.tableKey,
    code: r.code,
    label: r.label,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    isSystem: r.isSystem,
  };
}

function mapCustomFieldDef(
  r: typeof schema.customFieldDefinitions.$inferSelect,
): CustomFieldDefinition {
  return {
    id: r.id,
    recordType: r.recordType as CustomFieldRecordType,
    fieldKey: r.fieldKey,
    label: r.label,
    fieldType: r.fieldType as CustomFieldType,
    options: Array.isArray(r.options) ? (r.options as string[]) : null,
    sortOrder: r.sortOrder,
    isRequired: r.isRequired,
    isActive: r.isActive,
    helpText: r.helpText,
  };
}

function mapCustomFieldValue(
  r: typeof schema.customFieldValues.$inferSelect,
): CustomFieldValue {
  return {
    id: r.id,
    definitionId: r.definitionId,
    recordId: r.recordId,
    valueText: r.valueText,
    valueNumber: r.valueNumber,
    valueDate: r.valueDate,
    valueBoolean: r.valueBoolean,
  };
}

function mapOffice(r: typeof schema.offices.$inferSelect): Office {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    address: r.address,
    currencyCode: r.currencyCode,
    kind: r.kind,
    jurisdiction: r.jurisdiction,
    ein: r.ein,
    registrationNumber: r.registrationNumber,
    formationDate: r.formationDate,
    regionId: r.regionId ?? null,
    isActive: r.isActive,
    notes: r.notes,
  };
}

function mapRegionGroup(
  r: typeof schema.regionGroups.$inferSelect,
): import("./types").RegionGroup {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    displayOrder: r.displayOrder,
  };
}

function mapRegion(r: typeof schema.regions.$inferSelect): import("./types").Region {
  return {
    id: r.id,
    name: r.name,
    groupId: r.groupId ?? null,
    notes: r.notes,
    displayOrder: r.displayOrder,
  };
}

function mapDimension(
  r: typeof schema.dimensions.$inferSelect,
): import("./types").Dimension {
  return {
    id: r.id,
    key: r.key,
    label: r.label,
    description: r.description,
    isActive: r.isActive,
    displayOrder: r.displayOrder,
  };
}

function mapDimensionValue(
  r: typeof schema.dimensionValues.$inferSelect,
): import("./types").DimensionValue {
  return {
    id: r.id,
    dimensionId: r.dimensionId,
    code: r.code,
    label: r.label,
    parentId: r.parentId ?? null,
    isActive: r.isActive,
    displayOrder: r.displayOrder,
  };
}

function mapPriceList(r: typeof schema.priceLists.$inferSelect): PriceList {
  return {
    id: r.id,
    officeId: r.officeId,
    name: r.name,
    versionNumber: r.versionNumber,
    effectiveDate: r.effectiveDate,
    isActive: r.isActive,
    isCurrent: r.isCurrent,
    parentVersionId: r.parentVersionId,
    notes: r.notes,
  };
}

function mapPriceListEntry(
  r: typeof schema.priceListEntries.$inferSelect,
): PriceListEntry {
  return {
    id: r.id,
    priceListId: r.priceListId,
    itemType: r.itemType as PriceListItemType,
    itemKey: r.itemKey,
    label: r.label,
    unitPrice: r.unitPrice,
    includedQuantity: r.includedQuantity,
    notes: r.notes,
  };
}

function mapContact(r: typeof schema.contacts.$inferSelect): Contact {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind as ContactKind,
    email: r.email,
    phone: r.phone,
    address: r.address,
    notes: r.notes,
    isClient: r.isClient,
    isVendor: r.isVendor,
    isEmployee: r.isEmployee,
    isIntermediary: r.isIntermediary,
    customerId: r.customerId,
    vendorId: r.vendorId,
    userId: r.userId,
    isActive: r.isActive,
  };
}

function mapContactLink(r: typeof schema.contactLinks.$inferSelect): ContactLink {
  return {
    id: r.id,
    contactId: r.contactId,
    refType: r.refType as ContactLinkRefType,
    refId: r.refId,
    role: r.role,
    notes: r.notes,
  };
}

function mapCustomer(r: typeof schema.customers.$inferSelect): Customer {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    email: r.email,
    phone: r.phone,
    billingAddress: r.billingAddress,
    paymentTerms: r.paymentTerms,
    assignedUserId: r.assignedUserId,
    regionId: (r as { regionId?: string | null }).regionId ?? null,
    taxRate: (r as { taxRate?: string }).taxRate ?? "0",
    taxExempt: (r as { taxExempt?: boolean }).taxExempt ?? false,
    isActive: r.isActive,
    notes: r.notes,
  };
}

function mapVendor(r: typeof schema.vendors.$inferSelect): Vendor {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    email: r.email,
    phone: r.phone,
    address: r.address,
    paymentTerms: r.paymentTerms,
    defaultExpenseAccountId: r.defaultExpenseAccountId,
    isActive: r.isActive,
    notes: r.notes,
    invoiceNumberPrefix: r.invoiceNumberPrefix,
    invoiceNumberPattern: r.invoiceNumberPattern,
    invoiceNumberLastUsed: r.invoiceNumberLastUsed,
  };
}

function mapBankAccount(r: typeof schema.bankAccounts.$inferSelect): BankAccount {
  return {
    id: r.id,
    name: r.name,
    accountId: r.accountId,
    institution: r.institution,
    lastFour: r.lastFour,
    currencyCode: r.currencyCode,
    isActive: r.isActive,
    entityId: r.entityId,
    clientId: r.clientId,
    currentBalance: r.currentBalance,
    balanceAsOf: r.balanceAsOf,
  };
}

function mapSigner(
  r: typeof schema.bankAccountSigners.$inferSelect,
): BankAccountSigner {
  return {
    id: r.id,
    bankAccountId: r.bankAccountId,
    name: r.name,
    email: r.email,
    title: r.title,
    authority: r.authority as SigningAuthority,
    isPrimary: r.isPrimary,
    addedDate: r.addedDate,
    notes: r.notes,
  };
}

function mapBankTransaction(
  r: typeof schema.bankTransactions.$inferSelect,
): BankTransaction {
  return {
    id: r.id,
    bankAccountId: r.bankAccountId,
    transactionDate: r.transactionDate,
    description: r.description,
    amount: r.amount,
    reference: r.reference,
    isReconciled: r.isReconciled,
    reconciledAt: isoOrNull(r.reconciledAt),
    journalEntryId: r.journalEntryId,
  };
}

// JSONB columns come back as `unknown` — narrow to DimensionMap with a
// safety net so a bad row doesn't crash the page render.
function asDimensionMap(v: unknown): import("./types").DimensionMap {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as import("./types").DimensionMap;
  }
  return {};
}

function mapJournalLine(r: typeof schema.journalLines.$inferSelect): JournalLine {
  return {
    id: r.id,
    journalEntryId: r.journalEntryId,
    lineNumber: r.lineNumber,
    accountId: r.accountId,
    description: r.description,
    debit: r.debit,
    credit: r.credit,
    intercompanyCounterpartEntityId: r.intercompanyCounterpartEntityId ?? null,
    dimensions: asDimensionMap(r.dimensions),
  };
}

function mapInvoiceLine(r: typeof schema.invoiceLines.$inferSelect): InvoiceLine {
  return {
    id: r.id,
    invoiceId: r.invoiceId,
    lineNumber: r.lineNumber,
    description: r.description,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    amount: r.amount,
    accountId: r.accountId,
    dimensions: asDimensionMap(r.dimensions),
  };
}

function mapBillLine(r: typeof schema.billLines.$inferSelect): BillLine {
  return {
    id: r.id,
    billId: r.billId,
    lineNumber: r.lineNumber,
    description: r.description,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    amount: r.amount,
    accountId: r.accountId,
    clientId: r.clientId ?? null,
    entityId: r.entityId ?? null,
    dimensions: asDimensionMap(r.dimensions),
  };
}

function mapJournalEntry(
  r: typeof schema.journalEntries.$inferSelect,
  lines: JournalLine[],
): JournalEntry {
  return {
    id: r.id,
    entryNumber: r.entryNumber,
    entryDate: r.entryDate,
    fiscalPeriodId: r.fiscalPeriodId,
    description: r.description,
    reference: r.reference,
    source: r.source as JournalEntry["source"],
    status: r.status as JournalEntryStatus,
    postedAt: isoOrNull(r.postedAt),
    postedBy: r.postedBy,
    voidedAt: isoOrNull(r.voidedAt),
    voidReason: r.voidReason,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    entityId: r.entityId,
    firmEntityId: r.firmEntityId ?? null,
    bypassControlWarning: r.bypassControlWarning ?? false,
    periodOverrideReason: r.periodOverrideReason ?? null,
    eliminationEntryId: r.eliminationEntryId ?? null,
    isTemplate: r.isTemplate ?? false,
    recurringFrequency:
      (r.recurringFrequency as JournalEntry["recurringFrequency"]) ?? null,
    recurringDayOfMonth: r.recurringDayOfMonth ?? null,
    recurringNextDate: r.recurringNextDate ?? null,
    recurringEndDate: r.recurringEndDate ?? null,
    recurringParentId: r.recurringParentId ?? null,
    lines: lines.sort((a, b) => a.lineNumber - b.lineNumber),
  };
}

function mapInvoice(
  r: typeof schema.invoices.$inferSelect,
  lines: InvoiceLine[],
): Invoice {
  return {
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    customerId: r.customerId,
    entityId: r.entityId,
    clientId: r.clientId,
    invoiceDate: r.invoiceDate,
    dueDate: r.dueDate,
    status: r.status as Invoice["status"],
    cfoApprovedAt: isoOrNull(r.cfoApprovedAt),
    cfoApprovedBy: r.cfoApprovedBy,
    assignedApprovedAt: isoOrNull(r.assignedApprovedAt),
    assignedApprovedBy: r.assignedApprovedBy,
    rejectedAt: isoOrNull(r.rejectedAt),
    rejectedBy: r.rejectedBy,
    rejectionReason: r.rejectionReason,
    subtotal: r.subtotal,
    taxRate: (r as { taxRate?: string }).taxRate ?? "0",
    taxExempt: (r as { taxExempt?: boolean }).taxExempt ?? false,
    taxAmount: r.taxAmount,
    total: r.total,
    amountPaid: r.amountPaid,
    balanceDue: r.balanceDue,
    currencyCode: r.currencyCode,
    expectedPaymentDate: r.expectedPaymentDate,
    notes: r.notes,
    journalEntryId: r.journalEntryId,
    lines: lines.sort((a, b) => a.lineNumber - b.lineNumber),
  };
}

function mapBill(r: typeof schema.bills.$inferSelect, lines: BillLine[]): Bill {
  return {
    id: r.id,
    billNumber: r.billNumber,
    vendorId: r.vendorId,
    vendorInvoiceNumber: r.vendorInvoiceNumber ?? null,
    billDate: r.billDate,
    dueDate: r.dueDate,
    status: r.status as Bill["status"],
    subtotal: r.subtotal,
    taxAmount: r.taxAmount,
    total: r.total,
    amountPaid: r.amountPaid,
    balanceDue: r.balanceDue,
    currencyCode: r.currencyCode,
    notes: r.notes,
    journalEntryId: r.journalEntryId,
    clientId: r.clientId ?? null,
    entityId: r.entityId ?? null,
    chargebackClientId: r.chargebackClientId ?? null,
    chargebackEntityId: r.chargebackEntityId ?? null,
    chargebackType: (r.chargebackType ?? null) as Bill["chargebackType"],
    markupPct: r.markupPct ?? null,
    rebillAmount: r.rebillAmount ?? null,
    chargebackInvoiceId: r.chargebackInvoiceId ?? null,
    chargebackNotes: r.chargebackNotes ?? null,
    lines: lines.sort((a, b) => a.lineNumber - b.lineNumber),
  };
}

// --------- Lookups ---------

/**
 * Account lookups are entity-scoped:
 *   - omitted / `"all"` → every account (firm + entity-scoped). Default so
 *     existing callers (journal, reports, accounts page) keep their global
 *     view without changes.
 *   - `null` → firm-level chart only (entityId IS NULL).
 *   - `string` → just that entity's chart.
 */
export async function getAccounts(
  scope: string | null | "all" = "all",
): Promise<Account[]> {
  const db = getDb();
  const q = db.select().from(schema.accounts).orderBy(schema.accounts.code);
  if (scope === "all") {
    const rows = await q;
    return rows.map(mapAccount);
  }
  const rows =
    scope == null
      ? await q.where(isNull(schema.accounts.entityId))
      : await q.where(eq(schema.accounts.entityId, scope));
  return rows.map(mapAccount);
}

export async function getAccountByCode(
  code: string,
  scope: string | null = null,
): Promise<Account | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.code, code),
        scope == null
          ? isNull(schema.accounts.entityId)
          : eq(schema.accounts.entityId, scope),
      ),
    )
    .limit(1);
  return row ? mapAccount(row) : undefined;
}

export async function getAccountById(id: string): Promise<Account | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, id))
    .limit(1);
  return row ? mapAccount(row) : undefined;
}

export async function getCustomers(): Promise<Customer[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.customers)
    .orderBy(schema.customers.code);
  return rows.map(mapCustomer);
}

export async function getCustomerById(id: string): Promise<Customer | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, id))
    .limit(1);
  return row ? mapCustomer(row) : undefined;
}

export async function getCurrencies(): Promise<Currency[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.currencies)
    .orderBy(desc(schema.currencies.isBase), schema.currencies.code);
  return rows.map(mapCurrency);
}

export async function getBaseCurrency(): Promise<Currency | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.currencies)
    .where(eq(schema.currencies.isBase, true))
    .limit(1);
  return row ? mapCurrency(row) : undefined;
}

export async function getFxRates(): Promise<FxRate[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.fxRates)
    .orderBy(desc(schema.fxRates.rateDate), schema.fxRates.currencyCode);
  return rows.map(mapFxRate);
}

/**
 * Most-recent FX rate per currency. Base currency is implicitly 1.0.
 * Returns a map of currencyCode → rate (foreign per 1 unit of base).
 */
export async function getLatestFxRates(): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.fxRates)
    .orderBy(desc(schema.fxRates.rateDate));
  const latest = new Map<string, number>();
  for (const r of rows) {
    if (latest.has(r.currencyCode)) continue;
    latest.set(r.currencyCode, parseFloat(r.ratePerBase));
  }
  const base = await getBaseCurrency();
  if (base) latest.set(base.code, 1);
  return latest;
}

/**
 * Convert an amount in `from` currency to the base currency using the
 * latest FX rate. Returns null if the rate is unknown.
 */
export function convertToBase(
  amount: number,
  fromCurrency: string,
  rates: Map<string, number>,
): number | null {
  const r = rates.get(fromCurrency);
  if (r == null) return null;
  // ratePerBase is "foreign per 1 base" → base = foreign / rate
  return amount / r;
}

// ---------- Lookups + custom fields ----------

export async function getAttachments(
  recordType: AttachmentRecordType,
  recordId: string,
): Promise<Attachment[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.recordType, recordType),
        eq(schema.attachments.recordId, recordId),
      ),
    )
    .orderBy(desc(schema.attachments.createdAt));
  return rows.map(mapAttachment);
}

export async function getAttachmentById(id: string): Promise<Attachment | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.id, id))
    .limit(1);
  return row ? mapAttachment(row) : undefined;
}

export async function getLookupTables(): Promise<LookupTable[]> {
  const db = getDb();
  const rows = await db.select().from(schema.lookupTables).orderBy(schema.lookupTables.label);
  return rows.map(mapLookupTable);
}

export async function getLookupTableByKey(key: string): Promise<LookupTable | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.lookupTables)
    .where(eq(schema.lookupTables.key, key))
    .limit(1);
  return row ? mapLookupTable(row) : undefined;
}

export async function getLookupValues(tableKey: string): Promise<LookupValue[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.lookupValues)
    .where(eq(schema.lookupValues.tableKey, tableKey))
    .orderBy(schema.lookupValues.sortOrder, schema.lookupValues.label);
  return rows.map(mapLookupValue);
}

export async function getAllLookupValues(): Promise<LookupValue[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.lookupValues)
    .orderBy(schema.lookupValues.tableKey, schema.lookupValues.sortOrder);
  return rows.map(mapLookupValue);
}

export async function getCustomFieldDefinitions(
  recordType?: CustomFieldRecordType,
): Promise<CustomFieldDefinition[]> {
  const db = getDb();
  const base = db
    .select()
    .from(schema.customFieldDefinitions)
    .orderBy(schema.customFieldDefinitions.recordType, schema.customFieldDefinitions.sortOrder);
  const rows = recordType
    ? await base.where(eq(schema.customFieldDefinitions.recordType, recordType))
    : await base;
  return rows.map(mapCustomFieldDef);
}

export async function getCustomFieldDefinitionById(
  id: string,
): Promise<CustomFieldDefinition | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.customFieldDefinitions)
    .where(eq(schema.customFieldDefinitions.id, id))
    .limit(1);
  return row ? mapCustomFieldDef(row) : undefined;
}

export async function getCustomFieldValuesForRecord(
  recordId: string,
): Promise<CustomFieldValue[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.customFieldValues)
    .where(eq(schema.customFieldValues.recordId, recordId));
  return rows.map(mapCustomFieldValue);
}

export async function getOffices(): Promise<Office[]> {
  const db = getDb();
  const rows = await db.select().from(schema.offices).orderBy(schema.offices.name);
  return rows.map(mapOffice);
}

/**
 * Firm corporate entities. Alias for offices that read as "the firms we
 * bill clients from". The topbar entity-scope picker shows these.
 */
export async function getFirmEntities(): Promise<Office[]> {
  return getOffices();
}

export async function getFirmEntityById(id: string): Promise<Office | undefined> {
  const db = getDb();
  const [row] = await db.select().from(schema.offices).where(eq(schema.offices.id, id)).limit(1);
  return row ? mapOffice(row) : undefined;
}

export async function getOfficeById(id: string): Promise<Office | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.offices)
    .where(eq(schema.offices.id, id))
    .limit(1);
  return row ? mapOffice(row) : undefined;
}

export async function getPriceLists(): Promise<PriceList[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.priceLists)
    .orderBy(schema.priceLists.officeId, desc(schema.priceLists.versionNumber));
  return rows.map(mapPriceList);
}

export async function getPriceListById(id: string): Promise<PriceList | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.priceLists)
    .where(eq(schema.priceLists.id, id))
    .limit(1);
  return row ? mapPriceList(row) : undefined;
}

export async function getPriceListsByOfficeId(
  officeId: string,
): Promise<PriceList[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.priceLists)
    .where(eq(schema.priceLists.officeId, officeId))
    .orderBy(desc(schema.priceLists.versionNumber));
  return rows.map(mapPriceList);
}

export async function getPriceListEntries(
  priceListId: string,
): Promise<PriceListEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.priceListEntries)
    .where(eq(schema.priceListEntries.priceListId, priceListId))
    .orderBy(schema.priceListEntries.itemType, schema.priceListEntries.label);
  return rows.map(mapPriceListEntry);
}

export async function getContacts(): Promise<Contact[]> {
  const db = getDb();
  const rows = await db.select().from(schema.contacts).orderBy(schema.contacts.name);
  return rows.map(mapContact);
}

/**
 * Look up a contact by either the internal id (e.g. `co-012`) or the
 * user-facing code (e.g. `CT-EMP-002`). The detail page route uses the
 * id, but bookmarks and copy/paste against the displayed code should
 * still resolve.
 */
export async function getContactById(id: string): Promise<Contact | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.contacts)
    .where(or(eq(schema.contacts.id, id), eq(schema.contacts.code, id)))
    .limit(1);
  return row ? mapContact(row) : undefined;
}

export async function getContactLinksByContactId(
  contactId: string,
): Promise<ContactLink[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contactLinks)
    .where(eq(schema.contactLinks.contactId, contactId));
  return rows.map(mapContactLink);
}

export async function getContactLinksByRef(
  refType: ContactLinkRefType,
  refId: string,
): Promise<ContactLink[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contactLinks)
    .where(
      and(
        eq(schema.contactLinks.refType, refType),
        eq(schema.contactLinks.refId, refId),
      ),
    );
  return rows.map(mapContactLink);
}

export async function getEmployeeRates(): Promise<EmployeeRate[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.employeeRates)
    .orderBy(desc(schema.employeeRates.effectiveDate));
  return rows.map(mapEmployeeRate);
}

export async function getEmployeeRateById(id: string): Promise<EmployeeRate | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.employeeRates)
    .where(eq(schema.employeeRates.id, id))
    .limit(1);
  return row ? mapEmployeeRate(row) : undefined;
}

export async function getTimeEntries(): Promise<TimeEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.timeEntries)
    .orderBy(desc(schema.timeEntries.entryDate));
  return rows.map(mapTimeEntry);
}

export async function getTimeEntryById(id: string): Promise<TimeEntry | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.timeEntries)
    .where(eq(schema.timeEntries.id, id))
    .limit(1);
  return row ? mapTimeEntry(row) : undefined;
}

export async function getFeeSchedules(): Promise<FeeSchedule[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.feeSchedules)
    .orderBy(desc(schema.feeSchedules.applicableYear), schema.feeSchedules.name);
  return rows.map(mapFeeSchedule);
}

export async function getFeeScheduleById(id: string): Promise<FeeSchedule | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.feeSchedules)
    .where(eq(schema.feeSchedules.id, id))
    .limit(1);
  return row ? mapFeeSchedule(row) : undefined;
}

export async function getEntityFees(): Promise<EntityFee[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.entityFees)
    .orderBy(desc(schema.entityFees.billingYear));
  return rows.map(mapEntityFee);
}

export async function getCustomerAssignments(
  customerId: string,
): Promise<import("./types").CustomerAssignment[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.customerAssignments)
    .where(eq(schema.customerAssignments.customerId, customerId))
    .orderBy(desc(schema.customerAssignments.isPrimary));
  return rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    userId: r.userId,
    isPrimary: r.isPrimary,
    canApprove: r.canApprove,
    role: r.role,
  }));
}

/** Full list of customer↔user assignments. Used by AR Aging's employee view. */
export async function getAllCustomerAssignments(): Promise<
  import("./types").CustomerAssignment[]
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.customerAssignments)
    .orderBy(desc(schema.customerAssignments.isPrimary));
  return rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    userId: r.userId,
    isPrimary: r.isPrimary,
    canApprove: r.canApprove,
    role: r.role,
  }));
}

export async function getRecurringPayments(): Promise<import("./types").RecurringPayment[]> {
  const db = getDb();
  const rows = await db.select().from(schema.recurringPayments).orderBy(asc(schema.recurringPayments.nextPaymentDate));
  return rows.map(mapRecurringPayment);
}

export async function getRecurringPaymentById(id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.recurringPayments)
    .where(eq(schema.recurringPayments.id, id))
    .limit(1);
  return row ? mapRecurringPayment(row) : undefined;
}

export async function getBudgets(fiscalYear?: number) {
  const db = getDb();
  const rows = fiscalYear
    ? await db.select().from(schema.budgets).where(eq(schema.budgets.fiscalYear, fiscalYear))
    : await db.select().from(schema.budgets);
  return rows.map(mapBudget);
}

export async function getEntityFeesByEntityId(entityId: string): Promise<EntityFee[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.entityFees)
    .where(eq(schema.entityFees.entityId, entityId))
    .orderBy(desc(schema.entityFees.billingYear));
  return rows.map(mapEntityFee);
}

export async function getEntityFeeById(id: string): Promise<EntityFee | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.entityFees)
    .where(eq(schema.entityFees.id, id))
    .limit(1);
  return row ? mapEntityFee(row) : undefined;
}

export async function getEntities(): Promise<Entity[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.entities)
    .orderBy(schema.entities.code);
  return rows.map(mapEntity);
}

export async function getEntityById(id: string): Promise<Entity | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.entities)
    .where(eq(schema.entities.id, id))
    .limit(1);
  return row ? mapEntity(row) : undefined;
}

export async function getEntitiesByClientId(clientId: string): Promise<Entity[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.entities)
    .where(eq(schema.entities.clientId, clientId))
    .orderBy(schema.entities.code);
  return rows.map(mapEntity);
}

export async function getAssets(): Promise<Asset[]> {
  const db = getDb();
  const rows = await db.select().from(schema.assets).orderBy(schema.assets.name);
  return rows.map(mapAsset);
}

export async function getAssetById(id: string): Promise<Asset | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.id, id))
    .limit(1);
  return row ? mapAsset(row) : undefined;
}

export async function getAssetsByEntityId(entityId: string): Promise<Asset[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.entityId, entityId))
    .orderBy(schema.assets.name);
  return rows.map(mapAsset);
}

/**
 * Assets directly owned by a client (no entity wrapper). Used to render
 * the "direct holdings" section on customer detail pages.
 */
export async function getAssetsByClientId(clientId: string): Promise<Asset[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.assets)
    .where(
      and(
        isNull(schema.assets.entityId),
        eq(schema.assets.clientId, clientId),
      ),
    )
    .orderBy(schema.assets.name);
  return rows.map(mapAsset);
}

export async function getSnapshotsByAssetId(
  assetId: string,
): Promise<AssetValueSnapshot[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.assetValueSnapshots)
    .where(eq(schema.assetValueSnapshots.assetId, assetId))
    .orderBy(desc(schema.assetValueSnapshots.snapshotDate));
  return rows.map(mapSnapshot);
}

/**
 * For each asset, return its most recent snapshot (or undefined if none).
 * One query, bucketed in JS — fine at demo scale; promote to a window
 * function if the assets table grows large.
 */
export async function getLatestSnapshotByAsset(): Promise<
  Map<string, AssetValueSnapshot>
> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.assetValueSnapshots)
    .orderBy(desc(schema.assetValueSnapshots.snapshotDate));
  const latest = new Map<string, AssetValueSnapshot>();
  for (const r of rows) {
    if (latest.has(r.assetId)) continue;
    latest.set(r.assetId, mapSnapshot(r));
  }
  return latest;
}

export async function getVendors(): Promise<Vendor[]> {
  const db = getDb();
  const rows = await db.select().from(schema.vendors).orderBy(schema.vendors.code);
  return rows.map(mapVendor);
}

export async function getVendorById(id: string): Promise<Vendor | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.vendors)
    .where(eq(schema.vendors.id, id))
    .limit(1);
  return row ? mapVendor(row) : undefined;
}

export async function getInvoices(): Promise<Invoice[]> {
  const db = getDb();
  const heads = await db
    .select()
    .from(schema.invoices)
    .orderBy(desc(schema.invoices.invoiceDate));
  if (heads.length === 0) return [];
  const ids = heads.map((h) => h.id);
  const lineRows = await db
    .select()
    .from(schema.invoiceLines)
    .where(inArray(schema.invoiceLines.invoiceId, ids));
  const linesByInvoice = new Map<string, InvoiceLine[]>();
  for (const l of lineRows) {
    const mapped = mapInvoiceLine(l);
    const arr = linesByInvoice.get(mapped.invoiceId) ?? [];
    arr.push(mapped);
    linesByInvoice.set(mapped.invoiceId, arr);
  }
  return heads.map((h) => mapInvoice(h, linesByInvoice.get(h.id) ?? []));
}

/**
 * Returns invoices that need the given user's action right now:
 * - status='pending_cfo' AND user role is 'CFO' or isSuperuser
 * - status='pending_assigned' AND user is any can_approve assignee on the
 *   customer (customer_assignments), or the legacy assigned_user_id, or
 *   isSuperuser.
 */
export async function getInvoicesAwaitingApproval(
  userId: string,
  role: string,
  isSuperuser: boolean,
): Promise<Array<Invoice & { customerName: string }>> {
  const db = getDb();
  const isCfo = role === "CFO" || isSuperuser;

  const allPending = await db
    .select()
    .from(schema.invoices)
    .where(inArray(schema.invoices.status, ["pending_cfo", "pending_assigned"]));
  if (allPending.length === 0) return [];

  const customerIds = Array.from(new Set(allPending.map((i) => i.customerId)));
  const [customers, assignments] = await Promise.all([
    db
      .select()
      .from(schema.customers)
      .where(inArray(schema.customers.id, customerIds)),
    db
      .select()
      .from(schema.customerAssignments)
      .where(inArray(schema.customerAssignments.customerId, customerIds)),
  ]);
  const customerMap = new Map(customers.map((c) => [c.id, c] as const));
  // customerId → set of userIds that can grant the assigned-approval.
  const approversByCustomer = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!a.canApprove) continue;
    const set = approversByCustomer.get(a.customerId) ?? new Set<string>();
    set.add(a.userId);
    approversByCustomer.set(a.customerId, set);
  }
  // Fold in the legacy single-assignee column so older customers without a
  // row in customer_assignments still authorise their primary user.
  for (const c of customers) {
    if (!c.assignedUserId) continue;
    const set = approversByCustomer.get(c.id) ?? new Set<string>();
    set.add(c.assignedUserId);
    approversByCustomer.set(c.id, set);
  }

  const filtered = allPending.filter((inv) => {
    if (inv.status === "pending_cfo") return isCfo;
    if (inv.status === "pending_assigned") {
      if (isSuperuser) return true;
      return approversByCustomer.get(inv.customerId)?.has(userId) ?? false;
    }
    return false;
  });

  if (filtered.length === 0) return [];

  // Pull lines so the mapper has them (kept light: we only need header data
  // on the dashboard tile, but mapInvoice expects lines)
  const ids = filtered.map((i) => i.id);
  const lineRows = await db
    .select()
    .from(schema.invoiceLines)
    .where(inArray(schema.invoiceLines.invoiceId, ids));
  const linesByInvoice = new Map<string, InvoiceLine[]>();
  for (const l of lineRows) {
    const mapped = mapInvoiceLine(l);
    const arr = linesByInvoice.get(mapped.invoiceId) ?? [];
    arr.push(mapped);
    linesByInvoice.set(mapped.invoiceId, arr);
  }

  return filtered.map((h) => ({
    ...mapInvoice(h, linesByInvoice.get(h.id) ?? []),
    customerName: customerMap.get(h.customerId)?.name ?? "—",
  }));
}

export type InvoiceNote = {
  id: string;
  invoiceId: string;
  note: string;
  authorName: string;
  authorUserId: string | null;
  createdAt: string;
};

/** Notes for a single invoice, oldest-first so the log reads top-to-bottom. */
export async function getInvoiceNotes(
  invoiceId: string,
): Promise<InvoiceNote[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.invoiceNotes)
    .where(eq(schema.invoiceNotes.invoiceId, invoiceId))
    .orderBy(asc(schema.invoiceNotes.createdAt));
  return rows.map((r) => ({
    id: r.id,
    invoiceId: r.invoiceId,
    note: r.note,
    authorName: r.authorName,
    authorUserId: r.authorUserId ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
  const db = getDb();
  const [head] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);
  if (!head) return undefined;
  const lines = await db
    .select()
    .from(schema.invoiceLines)
    .where(eq(schema.invoiceLines.invoiceId, id));
  return mapInvoice(head, lines.map(mapInvoiceLine));
}

export async function getBills(): Promise<Bill[]> {
  const db = getDb();
  const heads = await db
    .select()
    .from(schema.bills)
    .orderBy(desc(schema.bills.billDate));
  if (heads.length === 0) return [];
  const ids = heads.map((h) => h.id);
  const lineRows = await db
    .select()
    .from(schema.billLines)
    .where(inArray(schema.billLines.billId, ids));
  const linesByBill = new Map<string, BillLine[]>();
  for (const l of lineRows) {
    const mapped = mapBillLine(l);
    const arr = linesByBill.get(mapped.billId) ?? [];
    arr.push(mapped);
    linesByBill.set(mapped.billId, arr);
  }
  return heads.map((h) => mapBill(h, linesByBill.get(h.id) ?? []));
}

/**
 * Look for an existing bill from the same vendor with the same vendor
 * invoice number. Used by the bill form to warn (but not block) when the
 * same vendor invoice is being entered twice. Returns the first matching
 * bill or null.
 */
export async function findBillByVendorInvoiceNumber(
  vendorId: string,
  vendorInvoiceNumber: string,
  excludeBillId?: string,
): Promise<{ id: string; billNumber: string } | null> {
  if (!vendorId || !vendorInvoiceNumber.trim()) return null;
  const db = getDb();
  const rows = await db
    .select({
      id: schema.bills.id,
      billNumber: schema.bills.billNumber,
    })
    .from(schema.bills)
    .where(
      and(
        eq(schema.bills.vendorId, vendorId),
        eq(schema.bills.vendorInvoiceNumber, vendorInvoiceNumber.trim()),
      ),
    )
    .limit(2);
  const match = rows.find((r) => r.id !== excludeBillId);
  return match ?? null;
}

export async function getBillById(id: string): Promise<Bill | undefined> {
  const db = getDb();
  const [head] = await db
    .select()
    .from(schema.bills)
    .where(eq(schema.bills.id, id))
    .limit(1);
  if (!head) return undefined;
  const lines = await db
    .select()
    .from(schema.billLines)
    .where(eq(schema.billLines.billId, id));
  return mapBill(head, lines.map(mapBillLine));
}

/**
 * Bills tagged to rebill to a specific client that haven't yet been rolled
 * into a chargeback invoice. Used by the client detail "Pending
 * chargebacks" card and the bulk-billback flow. Excludes "included" bills
 * — those reference an annual fee and never get billed back separately.
 */
export async function getPendingChargebacksForClient(
  clientId: string,
): Promise<Bill[]> {
  const db = getDb();
  const heads = await db
    .select()
    .from(schema.bills)
    .where(
      and(
        eq(schema.bills.chargebackClientId, clientId),
        isNull(schema.bills.chargebackInvoiceId),
      ),
    )
    .orderBy(desc(schema.bills.billDate));
  if (heads.length === 0) return [];
  const ids = heads.map((h) => h.id);
  const lineRows = await db
    .select()
    .from(schema.billLines)
    .where(inArray(schema.billLines.billId, ids));
  const linesByBill = new Map<string, BillLine[]>();
  for (const l of lineRows) {
    const mapped = mapBillLine(l);
    const arr = linesByBill.get(mapped.billId) ?? [];
    arr.push(mapped);
    linesByBill.set(mapped.billId, arr);
  }
  return heads
    .map((h) => mapBill(h, linesByBill.get(h.id) ?? []))
    .filter((b) => b.chargebackType && b.chargebackType !== "included");
}

/**
 * Journal-entry scope is symmetrical to getAccounts():
 *   - omitted / `"all"` → all entries (firm + every entity).
 *   - `null` → firm-level only (entityId IS NULL).
 *   - `string` → just that entity.
 */
export async function getJournalEntries(
  scope?: string | null | "all",
): Promise<JournalEntry[]> {
  // Undefined → read from cookie. Explicit "all" or null/entityId still
  // override so internal calls (consolidation rollups, etc.) can bypass.
  const effective =
    scope === undefined ? (await getEntityScope()) ?? "all" : scope;
  const db = getDb();
  // Templates are blueprints, never part of the ledger — exclude from the
  // regular list. Use getJournalEntryTemplates() for the Templates tab.
  const base = db
    .select()
    .from(schema.journalEntries)
    .orderBy(desc(schema.journalEntries.entryDate), desc(schema.journalEntries.entryNumber));
  const notTemplate = eq(schema.journalEntries.isTemplate, false);
  // Scope by FIRM entity (which of our corporate entities issued the JE),
  // not by the legacy client-entity tag.
  const heads =
    effective === "all"
      ? await base.where(notTemplate)
      : effective == null
        ? await base.where(
            and(notTemplate, isNull(schema.journalEntries.firmEntityId)),
          )
        : await base.where(
            and(notTemplate, eq(schema.journalEntries.firmEntityId, effective)),
          );
  if (heads.length === 0) return [];
  const ids = heads.map((h) => h.id);
  const lineRows = await db
    .select()
    .from(schema.journalLines)
    .where(inArray(schema.journalLines.journalEntryId, ids));
  const linesByEntry = new Map<string, JournalLine[]>();
  for (const l of lineRows) {
    const mapped = mapJournalLine(l);
    const arr = linesByEntry.get(mapped.journalEntryId) ?? [];
    arr.push(mapped);
    linesByEntry.set(mapped.journalEntryId, arr);
  }
  return heads.map((h) => mapJournalEntry(h, linesByEntry.get(h.id) ?? []));
}

/**
 * Recurring journal entry templates. Returned in ascending recurringNextDate
 * order so the next-due-soonest is first. Includes lines so the list page
 * can preview totals and so generation can copy them verbatim.
 */
export async function getJournalEntryTemplates(
  scope?: string | null | "all",
): Promise<JournalEntry[]> {
  const effective =
    scope === undefined ? (await getEntityScope()) ?? "all" : scope;
  const db = getDb();
  const isTemplate = eq(schema.journalEntries.isTemplate, true);
  const base = db
    .select()
    .from(schema.journalEntries)
    .orderBy(
      asc(schema.journalEntries.recurringNextDate),
      desc(schema.journalEntries.entryNumber),
    );
  const heads =
    effective === "all"
      ? await base.where(isTemplate)
      : effective == null
        ? await base.where(
            and(isTemplate, isNull(schema.journalEntries.firmEntityId)),
          )
        : await base.where(
            and(isTemplate, eq(schema.journalEntries.firmEntityId, effective)),
          );
  if (heads.length === 0) return [];
  const ids = heads.map((h) => h.id);
  const lineRows = await db
    .select()
    .from(schema.journalLines)
    .where(inArray(schema.journalLines.journalEntryId, ids));
  const linesByEntry = new Map<string, JournalLine[]>();
  for (const l of lineRows) {
    const mapped = mapJournalLine(l);
    const arr = linesByEntry.get(mapped.journalEntryId) ?? [];
    arr.push(mapped);
    linesByEntry.set(mapped.journalEntryId, arr);
  }
  return heads.map((h) => mapJournalEntry(h, linesByEntry.get(h.id) ?? []));
}

/**
 * Count of templates whose recurringNextDate is on or before `today`. Used
 * by the dashboard "Recurring entries due" card and the JE list banner.
 */
export async function getDueRecurringTemplateCount(
  today: string,
  scope?: string | null | "all",
): Promise<number> {
  const templates = await getJournalEntryTemplates(scope);
  return templates.filter((t) => {
    if (!t.recurringNextDate) return false;
    if (t.recurringEndDate && t.recurringEndDate < t.recurringNextDate) {
      return false;
    }
    return t.recurringNextDate <= today;
  }).length;
}

/**
 * Journal entries scoped to a CLIENT entity (the `entities` table — Joe Smith
 * Trust, etc.). Uses `journalEntries.entityId`, not `firmEntityId` which
 * stores firm-issuer IDs. Used by /entities/[id]/books to show per-client-
 * entity books regardless of which firm issued the entry.
 */
export async function getJournalEntriesByClientEntity(
  clientEntityId: string,
): Promise<JournalEntry[]> {
  const db = getDb();
  const heads = await db
    .select()
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.entityId, clientEntityId))
    .orderBy(
      desc(schema.journalEntries.entryDate),
      desc(schema.journalEntries.entryNumber),
    );
  if (heads.length === 0) return [];
  const ids = heads.map((h) => h.id);
  const lineRows = await db
    .select()
    .from(schema.journalLines)
    .where(inArray(schema.journalLines.journalEntryId, ids));
  const linesByEntry = new Map<string, JournalLine[]>();
  for (const l of lineRows) {
    const mapped = mapJournalLine(l);
    const arr = linesByEntry.get(mapped.journalEntryId) ?? [];
    arr.push(mapped);
    linesByEntry.set(mapped.journalEntryId, arr);
  }
  return heads.map((h) => mapJournalEntry(h, linesByEntry.get(h.id) ?? []));
}

export async function getJournalEntryById(id: string): Promise<JournalEntry | undefined> {
  const db = getDb();
  const [head] = await db
    .select()
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.id, id))
    .limit(1);
  if (!head) return undefined;
  const lines = await db
    .select()
    .from(schema.journalLines)
    .where(eq(schema.journalLines.journalEntryId, id));
  return mapJournalEntry(head, lines.map(mapJournalLine));
}

export async function getJournalEntryByNumber(num: string): Promise<JournalEntry | undefined> {
  const db = getDb();
  const [head] = await db
    .select()
    .from(schema.journalEntries)
    .where(eq(schema.journalEntries.entryNumber, num))
    .limit(1);
  if (!head) return undefined;
  const lines = await db
    .select()
    .from(schema.journalLines)
    .where(eq(schema.journalLines.journalEntryId, head.id));
  return mapJournalEntry(head, lines.map(mapJournalLine));
}

export async function getPeriods(): Promise<FiscalPeriod[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.fiscalPeriods)
    .orderBy(asc(schema.fiscalPeriods.startDate));
  return rows.map(mapPeriod);
}

export async function getBankAccounts(): Promise<BankAccount[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.bankAccounts)
    .orderBy(schema.bankAccounts.name);
  return rows.map(mapBankAccount);
}

export async function getBankAccountById(id: string): Promise<BankAccount | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, id))
    .limit(1);
  return row ? mapBankAccount(row) : undefined;
}

export async function getSignersByBankAccountId(
  bankAccountId: string,
): Promise<BankAccountSigner[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.bankAccountSigners)
    .where(eq(schema.bankAccountSigners.bankAccountId, bankAccountId))
    .orderBy(desc(schema.bankAccountSigners.isPrimary), schema.bankAccountSigners.name);
  return rows.map(mapSigner);
}

export async function getBankTransactions(bankAccountId?: string): Promise<BankTransaction[]> {
  const db = getDb();
  const rows = bankAccountId
    ? await db
        .select()
        .from(schema.bankTransactions)
        .where(eq(schema.bankTransactions.bankAccountId, bankAccountId))
        .orderBy(desc(schema.bankTransactions.transactionDate))
    : await db
        .select()
        .from(schema.bankTransactions)
        .orderBy(desc(schema.bankTransactions.transactionDate));
  return rows.map(mapBankTransaction);
}

export async function getUsers(): Promise<User[]> {
  const db = getDb();
  const rows = await db.select().from(schema.users).orderBy(schema.users.fullName);
  return rows.map(mapUser);
}

export async function getUserById(id: string): Promise<User | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  return row ? mapUser(row) : undefined;
}

// --------- Derived: balances ---------

/**
 * Fetch all posted journal lines once and bucket by account. Cheaper than
 * one SELECT per account when callers need many balances (KPIs, TB,
 * accounts page).
 */
async function getSignedBalancesByAccount(
  scope: string | null | "all" = "all",
): Promise<Map<string, number>> {
  const db = getDb();
  const q = db
    .select({
      accountId: schema.journalLines.accountId,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
    })
    .from(schema.journalLines)
    .innerJoin(
      schema.journalEntries,
      eq(schema.journalLines.journalEntryId, schema.journalEntries.id),
    );

  // Elimination JEs are consolidation-only adjustments. They're INCLUDED at
  // the firm-level consolidated view (scope === "all") but EXCLUDED when
  // drilling into a single firm entity's books.
  let rows;
  if (scope === "all") {
    rows = await q.where(eq(schema.journalEntries.status, "posted"));
  } else if (scope == null) {
    rows = await q.where(
      and(
        eq(schema.journalEntries.status, "posted"),
        isNull(schema.journalEntries.firmEntityId),
        isNull(schema.journalEntries.eliminationEntryId),
      ),
    );
  } else {
    rows = await q.where(
      and(
        eq(schema.journalEntries.status, "posted"),
        eq(schema.journalEntries.firmEntityId, scope),
        isNull(schema.journalEntries.eliminationEntryId),
      ),
    );
  }

  const balances = new Map<string, number>();
  for (const r of rows) {
    const cur = balances.get(r.accountId) ?? 0;
    balances.set(r.accountId, cur + parseAmount(r.debit) - parseAmount(r.credit));
  }
  return balances;
}

/**
 * Display balance for a single account. Debit-normal accounts show
 * SUM(debit) - SUM(credit); credit-normal accounts show the inverse so
 * the displayed number is always non-negative for a "normal" balance.
 */
export async function getAccountBalance(accountId: string): Promise<number> {
  const balances = await getSignedBalancesByAccount();
  const account = await getAccountById(accountId);
  const signed = balances.get(accountId) ?? 0;
  if (!account) return signed;
  return account.normalBalance === "debit" ? signed : -signed;
}

/**
 * Per-entity P&L summary — totals revenue and expenses from posted
 * entity-scoped journal entries. The "firm" bucket holds JE rows whose
 * entityId is null, so the firm-level P&L still rolls up alongside.
 *
 * Returns one row per entity (plus a "firm" pseudo-row) so the
 * consolidation view can render a single table.
 */
export type EntityPlRow = {
  entityId: string | null;
  revenue: number;
  expenses: number;
  netIncome: number;
};

/**
 * Per-entity P&L rollup.
 *
 *   scope === "all"  → every posted entry, regardless of firm
 *   scope === null   → only firm-level entries (firm_entity_id IS NULL).
 *                       Rare; mostly empty after backfill.
 *   scope === string → only entries booked under that firm entity
 *                       (office). Lets the dashboard P&L card scope down
 *                       when the topbar is on OFC-NY or OFC-SF — so
 *                       "All entities" minus the visible firms add up.
 */
export async function getEntityPlRollup(
  scope: string | null | "all" = "all",
): Promise<EntityPlRow[]> {
  const db = getDb();
  const q = db
    .select({
      entityId: schema.journalEntries.entityId,
      accountType: schema.accounts.accountType,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
    })
    .from(schema.journalLines)
    .innerJoin(
      schema.journalEntries,
      eq(schema.journalLines.journalEntryId, schema.journalEntries.id),
    )
    .innerJoin(
      schema.accounts,
      eq(schema.journalLines.accountId, schema.accounts.id),
    );

  let rows;
  if (scope === "all") {
    rows = await q.where(eq(schema.journalEntries.status, "posted"));
  } else if (scope == null) {
    rows = await q.where(
      and(
        eq(schema.journalEntries.status, "posted"),
        isNull(schema.journalEntries.firmEntityId),
      ),
    );
  } else {
    rows = await q.where(
      and(
        eq(schema.journalEntries.status, "posted"),
        eq(schema.journalEntries.firmEntityId, scope),
      ),
    );
  }

  const buckets = new Map<string | null, { revenue: number; expenses: number }>();
  for (const r of rows) {
    const key = r.entityId;
    const b = buckets.get(key) ?? { revenue: 0, expenses: 0 };
    const d = parseAmount(r.debit);
    const c = parseAmount(r.credit);
    if (r.accountType === "revenue") b.revenue += c - d;
    else if (r.accountType === "expense") b.expenses += d - c;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries()).map(([entityId, b]) => ({
    entityId,
    revenue: b.revenue,
    expenses: b.expenses,
    netIncome: b.revenue - b.expenses,
  }));
}

export async function getKpis() {
  const scope = await getEntityScope();
  // Chart of Accounts is firm-level (shared across entities), so we always
  // read the full chart. Only the postings get filtered by entity scope.
  const accounts = await getAccounts("all");
  const balances = await getSignedBalancesByAccount(scope ?? "all");
  let revenue = 0,
    expenses = 0,
    assets = 0,
    liabilities = 0,
    equity = 0;
  let cash = 0;
  for (const a of accounts) {
    const raw = balances.get(a.id) ?? 0;
    if (a.accountType === "asset") assets += raw;
    else if (a.accountType === "liability") liabilities += -raw;
    else if (a.accountType === "equity") equity += -raw;
    else if (a.accountType === "revenue") revenue += -raw;
    else if (a.accountType === "expense") expenses += raw;
    if (a.code === "1000") cash = a.normalBalance === "debit" ? raw : -raw;
  }
  return {
    revenue,
    expenses,
    netIncome: revenue - expenses,
    assets,
    liabilities,
    equity,
    cash,
  };
}

export async function getTrialBalance() {
  const scope = await getEntityScope();
  const accounts = await getAccounts("all");
  const balances = await getSignedBalancesByAccount(scope ?? "all");
  return accounts
    .filter((a) => (balances.get(a.id) ?? 0) !== 0) // drop unused rows when entity-scoped
    .map((a) => {
    const signed = balances.get(a.id) ?? 0;
    const isDebit = a.normalBalance === "debit";
    const bal = isDebit ? signed : -signed;
    if (bal >= 0) {
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        debit: isDebit ? bal : 0,
        credit: isDebit ? 0 : bal,
      };
    }
    // Contra balance — flip
    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      debit: isDebit ? 0 : -bal,
      credit: isDebit ? -bal : 0,
    };
  });
}

// --------- Derived: intercompany ---------

/**
 * One row per intercompany line on a posted JE. Used by /reports/intercompany
 * to build the entity-pair matrix and to drive elimination generation.
 *
 * "From" = the firm entity that issued the JE (journalEntries.firmEntityId).
 * "To"   = the counterpart marked on the line.
 * Direction is derived per-line: debit → "due from" the counterpart
 * (receivable on the From entity); credit → "due to" the counterpart
 * (payable on the From entity).
 *
 * Elimination JEs (eliminationEntryId IS NOT NULL) are excluded so the
 * report shows the gross open balances awaiting elimination.
 */
export type IntercompanyLine = {
  entryId: string;
  entryNumber: string;
  entryDate: string;
  lineId: string;
  fromEntityId: string | null;
  toEntityId: string;
  accountId: string;
  debit: number;
  credit: number;
};

export async function getIntercompanyLines(): Promise<IntercompanyLine[]> {
  const db = getDb();
  const rows = await db
    .select({
      entryId: schema.journalEntries.id,
      entryNumber: schema.journalEntries.entryNumber,
      entryDate: schema.journalEntries.entryDate,
      lineId: schema.journalLines.id,
      fromEntityId: schema.journalEntries.firmEntityId,
      toEntityId: schema.journalLines.intercompanyCounterpartEntityId,
      accountId: schema.journalLines.accountId,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
    })
    .from(schema.journalLines)
    .innerJoin(
      schema.journalEntries,
      eq(schema.journalLines.journalEntryId, schema.journalEntries.id),
    )
    .where(
      and(
        eq(schema.journalEntries.status, "posted"),
        isNull(schema.journalEntries.eliminationEntryId),
        isNotNull(schema.journalLines.intercompanyCounterpartEntityId),
      ),
    );

  return rows
    .filter((r): r is typeof r & { toEntityId: string } => r.toEntityId != null)
    .map((r) => ({
      entryId: r.entryId,
      entryNumber: r.entryNumber,
      entryDate: r.entryDate,
      lineId: r.lineId,
      fromEntityId: r.fromEntityId,
      toEntityId: r.toEntityId,
      accountId: r.accountId,
      debit: parseAmount(r.debit),
      credit: parseAmount(r.credit),
    }));
}

/**
 * Aggregated intercompany balances per ordered (from, to) pair. For each
 * pair:
 *   dueFrom = sum(debits) — entity A is owed by entity B
 *   dueTo   = sum(credits) — entity A owes entity B
 * Net = dueFrom - dueTo (from the "from" entity's perspective).
 *
 * Reconciliation: across the matched pair (A↔B) the dueFrom on one side
 * should mirror the dueTo on the other. Mismatches are flagged red on
 * the report.
 */
export type IntercompanyPairBalance = {
  fromEntityId: string | null;
  toEntityId: string;
  dueFrom: number;
  dueTo: number;
  net: number;
  lineCount: number;
};

export async function getIntercompanyPairBalances(): Promise<
  IntercompanyPairBalance[]
> {
  const lines = await getIntercompanyLines();
  const map = new Map<string, IntercompanyPairBalance>();
  for (const l of lines) {
    const key = `${l.fromEntityId ?? "_firm"}|${l.toEntityId}`;
    const cur =
      map.get(key) ??
      ({
        fromEntityId: l.fromEntityId,
        toEntityId: l.toEntityId,
        dueFrom: 0,
        dueTo: 0,
        net: 0,
        lineCount: 0,
      } as IntercompanyPairBalance);
    cur.dueFrom += l.debit;
    cur.dueTo += l.credit;
    cur.net = cur.dueFrom - cur.dueTo;
    cur.lineCount += 1;
    map.set(key, cur);
  }
  return Array.from(map.values());
}

// --------- Derived: aging ---------

export async function getArAging(today: Date) {
  const invoices = await getInvoices();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const inv of invoices) {
    const bal = parseAmount(inv.balanceDue);
    if (bal <= 0) continue;
    const due = new Date(`${inv.dueDate}T00:00:00Z`);
    const daysOverdue = Math.floor(
      (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysOverdue <= 0) buckets.current += bal;
    else if (daysOverdue <= 30) buckets.d30 += bal;
    else if (daysOverdue <= 60) buckets.d60 += bal;
    else buckets.d90 += bal;
  }
  return buckets;
}

export async function getApAging(today: Date) {
  const bills = await getBills();
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const bill of bills) {
    const bal = parseAmount(bill.balanceDue);
    if (bal <= 0) continue;
    const due = new Date(`${bill.dueDate}T00:00:00Z`);
    const daysOverdue = Math.floor(
      (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysOverdue <= 0) buckets.current += bal;
    else if (daysOverdue <= 30) buckets.d30 += bal;
    else if (daysOverdue <= 60) buckets.d60 += bal;
    else buckets.d90 += bal;
  }
  return buckets;
}

// --------- Reporting v2: dated balances + monthly P&L ---------

/**
 * Signed-balance helper restricted to a date range. Used for income
 * statement on a custom period.
 *
 *   debit-normal account net = sum(debit) - sum(credit)
 *
 * Returns Map of accountId → signed delta in the range. Caller decides
 * whether to negate for credit-normal accounts.
 */
async function getSignedBalancesInRange(
  start: string, // inclusive
  end: string, // inclusive
  scope: string | null | "all" = "all",
): Promise<Map<string, number>> {
  const db = getDb();
  const q = db
    .select({
      accountId: schema.journalLines.accountId,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
    })
    .from(schema.journalLines)
    .innerJoin(
      schema.journalEntries,
      eq(schema.journalLines.journalEntryId, schema.journalEntries.id),
    );

  const conds = [
    eq(schema.journalEntries.status, "posted"),
    gte(schema.journalEntries.entryDate, start),
    lte(schema.journalEntries.entryDate, end),
  ];
  if (scope === null) {
    conds.push(isNull(schema.journalEntries.firmEntityId));
    conds.push(isNull(schema.journalEntries.eliminationEntryId));
  } else if (scope !== "all") {
    conds.push(eq(schema.journalEntries.firmEntityId, scope));
    conds.push(isNull(schema.journalEntries.eliminationEntryId));
  }
  const rows = await q.where(and(...conds));

  const balances = new Map<string, number>();
  for (const r of rows) {
    const cur = balances.get(r.accountId) ?? 0;
    balances.set(r.accountId, cur + parseAmount(r.debit) - parseAmount(r.credit));
  }
  return balances;
}

/**
 * Signed-balance helper for everything posted on or before `asOf` — used
 * by balance sheet as-of-date.
 */
export async function getSignedBalancesAsOf(
  asOf: string,
  scope: string | null | "all" = "all",
): Promise<Map<string, number>> {
  const db = getDb();
  const q = db
    .select({
      accountId: schema.journalLines.accountId,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
    })
    .from(schema.journalLines)
    .innerJoin(
      schema.journalEntries,
      eq(schema.journalLines.journalEntryId, schema.journalEntries.id),
    );

  const conds = [
    eq(schema.journalEntries.status, "posted"),
    lte(schema.journalEntries.entryDate, asOf),
  ];
  if (scope === null) {
    conds.push(isNull(schema.journalEntries.firmEntityId));
    conds.push(isNull(schema.journalEntries.eliminationEntryId));
  } else if (scope !== "all") {
    conds.push(eq(schema.journalEntries.firmEntityId, scope));
    conds.push(isNull(schema.journalEntries.eliminationEntryId));
  }
  const rows = await q.where(and(...conds));

  const balances = new Map<string, number>();
  for (const r of rows) {
    const cur = balances.get(r.accountId) ?? 0;
    balances.set(r.accountId, cur + parseAmount(r.debit) - parseAmount(r.credit));
  }
  return balances;
}

export type KpisSummary = {
  revenue: number;
  expenses: number;
  netIncome: number;
  assets: number;
  liabilities: number;
  equity: number;
  cash: number;
};

/**
 * KPI snapshot as of a specific date. Revenue/expenses are inception-to-date
 * (everything posted ≤ asOf); balance-sheet figures are also as-of `asOf`.
 *
 * If you need a period-over-period comparison (e.g. "this month vs last
 * month"), call `getIncomeStatementForPeriod` for the deltas and this for
 * the BS snapshot at each cutoff.
 */
export async function getKpisAsOf(
  asOf: string,
  scope?: string | null,
): Promise<KpisSummary> {
  const accounts = await getAccounts("all");
  const balances = await getSignedBalancesAsOf(asOf, scope ?? "all");
  let revenue = 0,
    expenses = 0,
    assets = 0,
    liabilities = 0,
    equity = 0,
    cash = 0;
  for (const a of accounts) {
    const raw = balances.get(a.id) ?? 0;
    if (a.accountType === "asset") assets += raw;
    else if (a.accountType === "liability") liabilities += -raw;
    else if (a.accountType === "equity") equity += -raw;
    else if (a.accountType === "revenue") revenue += -raw;
    else if (a.accountType === "expense") expenses += raw;
    if (a.code === "1000") cash = a.normalBalance === "debit" ? raw : -raw;
  }
  return {
    revenue,
    expenses,
    netIncome: revenue - expenses,
    assets,
    liabilities,
    equity,
    cash,
  };
}

export type IncomeStatementRow = {
  accountId: string;
  code: string;
  name: string;
  accountType: "revenue" | "expense";
  amount: number; // positive for revenue when earned, positive for expense when incurred
};

/**
 * Income statement detail for a date range — one row per
 * revenue/expense account that has activity in the range.
 */
export async function getIncomeStatementForPeriod(
  start: string,
  end: string,
  scope?: string | null,
): Promise<{ rows: IncomeStatementRow[]; revenue: number; expenses: number; netIncome: number }> {
  const accounts = await getAccounts("all");
  const balances = await getSignedBalancesInRange(start, end, scope ?? "all");
  const rows: IncomeStatementRow[] = [];
  let revenue = 0;
  let expenses = 0;
  for (const a of accounts) {
    if (a.accountType !== "revenue" && a.accountType !== "expense") continue;
    const raw = balances.get(a.id) ?? 0;
    if (raw === 0) continue;
    if (a.accountType === "revenue") {
      const v = -raw; // credit-normal
      rows.push({
        accountId: a.id,
        code: a.code,
        name: a.name,
        accountType: "revenue",
        amount: v,
      });
      revenue += v;
    } else {
      const v = raw; // debit-normal
      rows.push({
        accountId: a.id,
        code: a.code,
        name: a.name,
        accountType: "expense",
        amount: v,
      });
      expenses += v;
    }
  }
  rows.sort((r1, r2) => r1.code.localeCompare(r2.code));
  return { rows, revenue, expenses, netIncome: revenue - expenses };
}

export type MonthlyIncomeStatement = {
  year: number;
  months: number[]; // 1..12
  rows: Array<{
    accountId: string;
    code: string;
    name: string;
    accountType: "revenue" | "expense";
    byMonth: number[]; // length 12
    total: number;
  }>;
  revenueByMonth: number[];
  expensesByMonth: number[];
  netByMonth: number[];
};

/**
 * 12-month P&L breakdown for a fiscal year. Returns one row per active
 * revenue/expense account with per-month amounts (sign already flipped so
 * revenue is positive and expenses positive).
 */
export async function getMonthlyIncomeStatement(
  year: number,
  scope?: string | null,
): Promise<MonthlyIncomeStatement> {
  const accounts = await getAccounts("all");
  const accountIndex = new Map(accounts.map((a) => [a.id, a]));
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // Pull every revenue/expense posting for the year in one query, then
  // bucket in JS — twelve round-trips would be silly.
  const db = getDb();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const conds = [
    eq(schema.journalEntries.status, "posted"),
    gte(schema.journalEntries.entryDate, start),
    lte(schema.journalEntries.entryDate, end),
  ];
  if (scope === null) {
    conds.push(isNull(schema.journalEntries.firmEntityId));
    conds.push(isNull(schema.journalEntries.eliminationEntryId));
  } else if (scope && scope !== "all") {
    conds.push(eq(schema.journalEntries.firmEntityId, scope));
    conds.push(isNull(schema.journalEntries.eliminationEntryId));
  }

  const rows = await db
    .select({
      accountId: schema.journalLines.accountId,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
      entryDate: schema.journalEntries.entryDate,
    })
    .from(schema.journalLines)
    .innerJoin(
      schema.journalEntries,
      eq(schema.journalLines.journalEntryId, schema.journalEntries.id),
    )
    .where(and(...conds));

  type Bucket = { accountType: "revenue" | "expense"; byMonth: number[] };
  const byAccount = new Map<string, Bucket>();

  for (const r of rows) {
    const a = accountIndex.get(r.accountId);
    if (!a) continue;
    if (a.accountType !== "revenue" && a.accountType !== "expense") continue;
    const month = parseInt(r.entryDate.slice(5, 7), 10);
    if (month < 1 || month > 12) continue;
    const b =
      byAccount.get(r.accountId) ??
      ({ accountType: a.accountType, byMonth: Array(12).fill(0) } as Bucket);
    const signed = parseAmount(r.debit) - parseAmount(r.credit);
    // revenue credit-normal → flip; expense debit-normal → keep
    const v = a.accountType === "revenue" ? -signed : signed;
    b.byMonth[month - 1] += v;
    byAccount.set(r.accountId, b);
  }

  const outRows = Array.from(byAccount.entries())
    .map(([accountId, b]) => {
      const a = accountIndex.get(accountId)!;
      return {
        accountId,
        code: a.code,
        name: a.name,
        accountType: b.accountType,
        byMonth: b.byMonth,
        total: b.byMonth.reduce((s, v) => s + v, 0),
      };
    })
    .filter((r) => r.total !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  const revenueByMonth = Array(12).fill(0);
  const expensesByMonth = Array(12).fill(0);
  for (const r of outRows) {
    for (let i = 0; i < 12; i++) {
      if (r.accountType === "revenue") revenueByMonth[i] += r.byMonth[i];
      else expensesByMonth[i] += r.byMonth[i];
    }
  }
  const netByMonth = revenueByMonth.map((v, i) => v - expensesByMonth[i]);

  return {
    year,
    months,
    rows: outRows,
    revenueByMonth,
    expensesByMonth,
    netByMonth,
  };
}

/**
 * Total budgeted amount per account for a fiscal year. Sums monthly
 * budgets (month != null) and annual budgets (month == null) together so
 * either input style works.
 */
export async function getBudgetByAccount(
  fiscalYear: number,
): Promise<Map<string, number>> {
  const budgets = await getBudgets(fiscalYear);
  const out = new Map<string, number>();
  for (const b of budgets) {
    out.set(b.accountId, (out.get(b.accountId) ?? 0) + parseAmount(b.amount));
  }
  return out;
}

// --------- Helpers (pure, no DB) ---------

export function totalDebits(entry: JournalEntry): number {
  return sumDebits(entry.lines);
}

export function totalCredits(entry: JournalEntry): number {
  return sumCredits(entry.lines);
}

export function isBalanced(entry: JournalEntry): boolean {
  return Math.abs(totalDebits(entry) - totalCredits(entry)) < 0.005;
}

export function accountTypeOrder(): AccountType[] {
  return ["asset", "liability", "equity", "revenue", "expense"];
}

export async function accountsByType(): Promise<Map<AccountType, Account[]>> {
  const accounts = await getAccounts();
  const map = new Map<AccountType, Account[]>();
  for (const a of accounts) {
    if (!map.has(a.accountType)) map.set(a.accountType, []);
    map.get(a.accountType)!.push(a);
  }
  return map;
}

/**
 * Convenience for pages that compute multiple balances at once — exposes
 * the prefetched-balances helper so callers can avoid N+1 queries.
 *
 * Returns a Map of accountId → displayed balance (signed for debit-normal,
 * negated for credit-normal so the value follows accounting conventions).
 */
export async function getDisplayBalances(): Promise<Map<string, number>> {
  const scope = await getEntityScope();
  // Chart of accounts is firm-level. Only postings are filtered by entity.
  const accounts = await getAccounts("all");
  const balances = await getSignedBalancesByAccount(scope ?? "all");
  const out = new Map<string, number>();
  for (const a of accounts) {
    const signed = balances.get(a.id) ?? 0;
    out.set(a.id, a.normalBalance === "debit" ? signed : -signed);
  }
  return out;
}

// --------- Regions, region groups, dimensions ---------

export async function getRegions(): Promise<import("./types").Region[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.regions)
    .orderBy(asc(schema.regions.displayOrder), asc(schema.regions.name));
  return rows.map(mapRegion);
}

export async function getRegionById(
  id: string,
): Promise<import("./types").Region | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.regions)
    .where(eq(schema.regions.id, id))
    .limit(1);
  return row ? mapRegion(row) : undefined;
}

export async function getRegionGroups(): Promise<import("./types").RegionGroup[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.regionGroups)
    .orderBy(asc(schema.regionGroups.displayOrder), asc(schema.regionGroups.name));
  return rows.map(mapRegionGroup);
}

export async function getRegionGroupById(
  id: string,
): Promise<import("./types").RegionGroup | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.regionGroups)
    .where(eq(schema.regionGroups.id, id))
    .limit(1);
  return row ? mapRegionGroup(row) : undefined;
}

export async function getDimensions(opts?: {
  activeOnly?: boolean;
}): Promise<import("./types").Dimension[]> {
  const db = getDb();
  const rows = opts?.activeOnly
    ? await db
        .select()
        .from(schema.dimensions)
        .where(eq(schema.dimensions.isActive, true))
        .orderBy(asc(schema.dimensions.displayOrder), asc(schema.dimensions.label))
    : await db
        .select()
        .from(schema.dimensions)
        .orderBy(asc(schema.dimensions.displayOrder), asc(schema.dimensions.label));
  return rows.map(mapDimension);
}

export async function getDimensionByKey(
  key: string,
): Promise<import("./types").Dimension | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.dimensions)
    .where(eq(schema.dimensions.key, key))
    .limit(1);
  return row ? mapDimension(row) : undefined;
}

export async function getDimensionById(
  id: string,
): Promise<import("./types").Dimension | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.dimensions)
    .where(eq(schema.dimensions.id, id))
    .limit(1);
  return row ? mapDimension(row) : undefined;
}

export async function getDimensionValues(
  dimensionId: string,
): Promise<import("./types").DimensionValue[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.dimensionValues)
    .where(eq(schema.dimensionValues.dimensionId, dimensionId))
    .orderBy(
      asc(schema.dimensionValues.displayOrder),
      asc(schema.dimensionValues.label),
    );
  return rows.map(mapDimensionValue);
}

/**
 * Convenience for forms — returns every active dimension paired with its
 * values, in display order. The JE / invoice / bill line forms render one
 * <select> per row of this result.
 */
export async function getDimensionsWithValues(): Promise<
  Array<{
    dimension: import("./types").Dimension;
    values: import("./types").DimensionValue[];
  }>
> {
  const dims = await getDimensions({ activeOnly: true });
  if (dims.length === 0) return [];
  const db = getDb();
  const ids = dims.map((d) => d.id);
  const valueRows = await db
    .select()
    .from(schema.dimensionValues)
    .where(
      and(
        inArray(schema.dimensionValues.dimensionId, ids),
        eq(schema.dimensionValues.isActive, true),
      ),
    )
    .orderBy(
      asc(schema.dimensionValues.displayOrder),
      asc(schema.dimensionValues.label),
    );
  const byDim = new Map<string, import("./types").DimensionValue[]>();
  for (const r of valueRows) {
    const mapped = mapDimensionValue(r);
    const arr = byDim.get(mapped.dimensionId) ?? [];
    arr.push(mapped);
    byDim.set(mapped.dimensionId, arr);
  }
  return dims.map((d) => ({ dimension: d, values: byDim.get(d.id) ?? [] }));
}

// The "today" for the demo. Fix it so reports match the seeded data.
export const DEMO_TODAY = new Date("2026-05-13T00:00:00Z");
