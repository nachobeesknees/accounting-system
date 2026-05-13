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

export type JournalLine = {
  id: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  description: string | null;
  debit: string;
  credit: string;
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
  notes: string | null;
  currencyCode: string;
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
  taskType: string | null;
  isBillable: boolean;
  rateAtLog: string | null;
  invoiceId: string | null;
  notes: string | null;
};

export type Office = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  currencyCode: string;
  isActive: boolean;
  notes: string | null;
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
  isActive: boolean;
  notes: string | null;
};

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "void";

export type InvoiceLine = {
  id: string;
  invoiceId: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  accountId: string;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotal: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  balanceDue: string;
  currencyCode: string;
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
};

export type Bill = {
  id: string;
  billNumber: string;
  vendorId: string;
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
