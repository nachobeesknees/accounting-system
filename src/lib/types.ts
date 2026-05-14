export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type Account = {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  subType: string | null;
  normalBalance: "debit" | "credit";
  isActive: boolean;
  currencyCode: string;
  /** null = firm-level account; non-null = entity-scoped chart. */
  entityId: string | null;
};

export type FiscalPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closing" | "closed";
};

export type JournalEntryStatus = "draft" | "posted" | "void";

/**
 * Map of dimension key → dimension value id. Keys match
 * `dimensions.key` (e.g. "department", "project") and values match
 * `dimension_values.id`. Empty {} means no dimensions set.
 */
export type DimensionMap = Record<string, string>;

export type JournalLine = {
  id: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  description: string | null;
  debit: string;
  credit: string;
  /** Read side always populates from DB JSONB (defaults to {}). */
  dimensions?: DimensionMap;
};

export type JournalEntry = {
  id: string;
  entryNumber: string;
  entryDate: string;
  fiscalPeriodId: string | null;
  description: string | null;
  reference: string | null;
  source: "manual" | "invoice" | "bill" | "reconciliation";
  status: JournalEntryStatus;
  postedAt: string | null;
  postedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** null = firm-level journal; non-null = entity-scoped. */
  entityId: string | null;
  /** Which firm corporate entity issued this entry (drives scope). */
  firmEntityId?: string | null;
  /** Audit flag: user confirmed past an AR/AP/Cash direct-posting warning. */
  bypassControlWarning?: boolean;
  lines: JournalLine[];
};

export type EntityKind =
  | "llc"
  | "trust"
  | "scorp"
  | "ccorp"
  | "partnership"
  | "foundation"
  | "individual"
  | "other";

export type EntityStatus = "active" | "pending" | "dormant" | "dissolved";

export type Entity = {
  id: string;
  code: string;
  name: string;
  clientId: string;
  kind: EntityKind;
  jurisdiction: string | null;
  formationDate: string | null;
  status: EntityStatus;
  ein: string | null;
  /** Corporate registration / filing number (state secretary of state, etc.) */
  registrationNumber?: string | null;
  notes: string | null;
  currencyCode: string;
  /** Optional region (soft FK → regions.id). */
  regionId?: string | null;
};

export type Currency = {
  code: string;
  symbol: string;
  name: string;
  decimals: number;
  isBase: boolean;
  isActive: boolean;
};

export type LookupTable = {
  key: string;
  label: string;
  description: string | null;
  isSystem: boolean;
};

export type LookupValue = {
  id: string;
  tableKey: string;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
};

export type CustomFieldRecordType = "entity" | "contact" | "asset" | "bank_account";
export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select";

export type CustomFieldDefinition = {
  id: string;
  recordType: CustomFieldRecordType;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
  helpText: string | null;
};

export type AttachmentRecordType =
  | "journal_entry"
  | "invoice"
  | "bill"
  | "contact"
  | "entity"
  | "asset"
  | "bank_account"
  | "fee"
  | "time_entry"
  | "other";

export type Attachment = {
  id: string;
  recordType: AttachmentRecordType;
  recordId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
  blobPathname: string | null;
  uploadedBy: string | null;
  notes: string | null;
  documentType: string | null;
  createdAt: string;
};

export type CustomFieldValue = {
  id: string;
  definitionId: string;
  recordId: string;
  valueText: string | null;
  valueNumber: string | null;
  valueDate: string | null;
  valueBoolean: boolean | null;
};

export type FxRate = {
  id: string;
  currencyCode: string;
  rateDate: string;
  ratePerBase: string;
  source: string | null;
  notes: string | null;
};

export type FeeSchedule = {
  id: string;
  name: string;
  entityKind: EntityKind;
  annualFee: string;
  includedHours: string;
  applicableYear: number | null;
  isActive: boolean;
  notes: string | null;
};

export type EntityFeeStatus = "draft" | "active" | "billed" | "paid" | "void";

export type FeeFrequency =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "one_time";

export type EntityFee = {
  id: string;
  entityId: string;
  billingYear: number;
  feeScheduleId: string | null;
  annualFee: string;
  includedHours: string;
  status: EntityFeeStatus;
  invoiceId: string | null;
  notes: string | null;
  /** Billing cadence. annualFee / period-count = derived per-period amount. */
  frequency?: FeeFrequency;
  startDate?: string | null;
  endDate?: string | null;
  billingMonth?: number | null;
  billingDay?: number | null;
  nextBillingDate?: string | null;
  lastBilledDate?: string | null;
  /** Override the derived per-period amount. */
  perPeriodAmount?: string | null;
};

export type RecurringPaymentFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type RecurringPayment = {
  id: string;
  name: string;
  amount: string;
  frequency: RecurringPaymentFrequency;
  nextPaymentDate: string;
  expenseAccountId: string;
  vendorId: string | null;
  bankAccountId: string | null;
  isActive: boolean;
  notes: string | null;
};

export type Budget = {
  id: string;
  accountId: string;
  fiscalYear: number;
  /** NULL → annual budget; 1–12 → month-specific. */
  month: number | null;
  amount: string;
  notes: string | null;
};

export type EmployeeRate = {
  id: string;
  userId: string;
  role: string;
  billableRate: string;
  costRate: string | null;
  effectiveDate: string;
  isDefault: boolean;
  notes: string | null;
};

export type TimeEntry = {
  id: string;
  userId: string;
  entryDate: string;
  durationHours: string;
  description: string;
  clientId: string | null;
  entityId: string | null;
  /** Optional link to a specific entity service (entity_fee). */
  entityFeeId?: string | null;
  taskType: string | null;
  isBillable: boolean;
  rateAtLog: string | null;
  invoiceId: string | null;
  notes: string | null;
};

/**
 * Firm corporate entity (kept as `Office` for table-name compatibility).
 * Represents one of the firm's billing legal entities — what the topbar
 * scope picker switches between.
 */
export type Office = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  currencyCode: string;
  kind?: string | null;
  jurisdiction?: string | null;
  ein?: string | null;
  registrationNumber?: string | null;
  formationDate?: string | null;
  regionId?: string | null;
  isActive: boolean;
  notes: string | null;
};

/** Semantic alias surfaced in UI. */
export type FirmEntity = Office;

// ---- Office grouping (region + region group) ----

export type RegionGroup = {
  id: string;
  name: string;
  notes: string | null;
  displayOrder: number;
};

export type Region = {
  id: string;
  name: string;
  groupId: string | null;
  notes: string | null;
  displayOrder: number;
};

// ---- Dimensions (department / project / cost-center / ...) ----

export type Dimension = {
  id: string;
  /** Stable slug used inside DimensionMap (e.g. "department"). */
  key: string;
  label: string;
  description: string | null;
  isActive: boolean;
  displayOrder: number;
};

export type DimensionValue = {
  id: string;
  dimensionId: string;
  code: string;
  label: string;
  /** Optional hierarchy (Department > Sub-department). */
  parentId: string | null;
  isActive: boolean;
  displayOrder: number;
};

export type PriceList = {
  id: string;
  officeId: string;
  name: string;
  versionNumber: number;
  effectiveDate: string;
  isActive: boolean;
  isCurrent: boolean;
  parentVersionId: string | null;
  notes: string | null;
};

export type PriceListItemType = "entity_fee" | "time_rate" | "service";

export type PriceListEntry = {
  id: string;
  priceListId: string;
  itemType: PriceListItemType;
  itemKey: string;
  label: string;
  unitPrice: string;
  includedQuantity: string | null;
  notes: string | null;
};

export type ContactKind = "individual" | "organization";

export type ContactLinkRefType =
  | "entity"
  | "bank_account"
  | "invoice"
  | "bill"
  | "asset";

export type Contact = {
  id: string;
  code: string;
  name: string;
  kind: ContactKind;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isClient: boolean;
  isVendor: boolean;
  isEmployee: boolean;
  isIntermediary: boolean;
  customerId: string | null;
  vendorId: string | null;
  userId: string | null;
  isActive: boolean;
};

export type ContactLink = {
  id: string;
  contactId: string;
  refType: ContactLinkRefType;
  refId: string;
  role: string | null;
  notes: string | null;
};

export type AssetKind =
  | "real_estate"
  | "securities"
  | "cash"
  | "private_equity"
  | "art"
  | "vehicle"
  | "business_interest"
  | "intellectual_property"
  | "other";

export type Asset = {
  id: string;
  name: string;
  kind: AssetKind;
  /**
   * Ownership chain: client → entity → asset.
   * - `entityId` set → asset is held inside that entity.
   * - `entityId` null + `clientId` set → asset is directly held by client.
   */
  entityId: string | null;
  clientId: string | null;
  currencyCode: string;
  externalRef: string | null;
  acquiredDate: string | null;
  notes: string | null;
};

export type AssetValueSnapshot = {
  id: string;
  assetId: string;
  snapshotDate: string;
  value: string;
  currencyCode: string;
  source: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  paymentTerms: number;
  /**
   * Legacy single-assignee column. Kept for backwards compat with reads
   * that haven't migrated to customer_assignments yet. Reflects whoever
   * is_primary in the customer_assignments table after the migration.
   */
  assignedUserId: string | null;
  /** Optional region (soft FK → regions.id). */
  regionId?: string | null;
  isActive: boolean;
  notes: string | null;
};

/**
 * Many-to-many join: which employees (users) are assigned to which client.
 * Replaces customers.assigned_user_id with proper multi-assign support.
 */
export type CustomerAssignment = {
  id: string;
  customerId: string;
  userId: string;
  isPrimary: boolean;
  canApprove: boolean;
  role: string | null;
};

export type InvoiceStatus =
  | "draft"
  | "pending_cfo"
  | "pending_assigned"
  | "sent"
  | "partial"
  | "paid"
  | "overdue"
  | "void";

export type InvoiceLine = {
  id: string;
  invoiceId: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  accountId: string;
  /** Read side always populates from DB JSONB (defaults to {}). */
  dimensions?: DimensionMap;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  entityId: string | null;
  clientId: string | null;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  cfoApprovedAt: string | null;
  cfoApprovedBy: string | null;
  assignedApprovedAt: string | null;
  assignedApprovedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  currencyCode: string;
  expectedPaymentDate?: string | null;
  notes: string | null;
  journalEntryId: string | null;
  lines: InvoiceLine[];
};

export type Vendor = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: number;
  defaultExpenseAccountId: string | null;
  isActive: boolean;
  notes: string | null;
  /** Optional vendor invoice numbering convention (see schema.ts). */
  invoiceNumberPrefix: string | null;
  invoiceNumberPattern: string | null;
  invoiceNumberLastUsed: string | null;
};

export type BillStatus = "draft" | "approved" | "partial" | "paid" | "overdue" | "void";

export type BillLine = {
  id: string;
  billId: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  accountId: string;
  clientId?: string | null;
  entityId?: string | null;
  /** Read side always populates from DB JSONB (defaults to {}). */
  dimensions?: DimensionMap;
};

/**
 * Chargeback method when rebilling a vendor bill to a client/entity:
 *   - 'cost'     bill amount passed through 1:1
 *   - 'markup'   bill amount × (1 + markupPct/100)
 *   - 'fixed'    rebillAmount overrides
 *   - 'included' included in the entity's annual fee (no rebill, audit only)
 */
export type BillChargebackType = "cost" | "markup" | "fixed" | "included";

export type Bill = {
  id: string;
  billNumber: string;
  vendorId: string;
  /** Vendor's own invoice number (separate from our internal billNumber). */
  vendorInvoiceNumber?: string | null;
  billDate: string;
  dueDate: string;
  status: BillStatus;
  subtotal: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  currencyCode: string;
  notes: string | null;
  journalEntryId: string | null;
  /** Optional client this bill is on-behalf-of (different from chargeback). */
  clientId?: string | null;
  /** Optional entity this bill is on-behalf-of. */
  entityId?: string | null;
  // Chargeback fields — see BillChargebackType. All optional; absent =
  // bill is an internal expense, not rebilled.
  chargebackClientId?: string | null;
  chargebackEntityId?: string | null;
  chargebackType?: BillChargebackType | null;
  markupPct?: string | null;
  rebillAmount?: string | null;
  /** Set once this chargeback has been rebilled on a client invoice. */
  chargebackInvoiceId?: string | null;
  chargebackNotes?: string | null;
  lines: BillLine[];
};

export type BankAccount = {
  id: string;
  name: string;
  accountId: string;
  institution: string | null;
  lastFour: string | null;
  currencyCode: string;
  isActive: boolean;
  entityId: string | null;
  clientId: string | null;
  currentBalance: string | null;
  balanceAsOf: string | null;
};

export type SigningAuthority = "sole" | "joint" | "limited" | "view_only";

export type BankAccountSigner = {
  id: string;
  bankAccountId: string;
  name: string;
  email: string | null;
  title: string | null;
  authority: SigningAuthority;
  isPrimary: boolean;
  addedDate: string | null;
  notes: string | null;
};

export type BankTransaction = {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  description: string;
  amount: string;
  reference: string | null;
  isReconciled: boolean;
  reconciledAt: string | null;
  journalEntryId: string | null;
};

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isSuperuser: boolean;
};

export type SessionUser = {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  isSuperuser: boolean;
};
