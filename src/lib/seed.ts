import type {
  Account,
  Bill,
  BankAccount,
  BankTransaction,
  Customer,
  FiscalPeriod,
  Invoice,
  JournalEntry,
  User,
  Vendor,
} from "./types";

// Stable ids so server actions can reference records deterministically.
const id = (s: string) => s;
const D = (s: string) => s; // date as ISO string YYYY-MM-DD

export const USERS: User[] = [
  { id: id("u-admin"), email: "admin@thistlewood.com", fullName: "Demo Admin", role: "Admin", isSuperuser: true },
  { id: id("u-margery"), email: "margery@thistlewood.com", fullName: "Margery Crumplebottom", role: "Bookkeeper", isSuperuser: false },
  { id: id("u-aldous"), email: "aldous@thistlewood.com", fullName: "Aldous Pepperton", role: "Controller", isSuperuser: false },
  { id: id("u-eustace"), email: "eustace@thistlewood.com", fullName: "Eustace Brindleworth", role: "CFO", isSuperuser: false },
];

export const ACCOUNTS: Account[] = [
  { id: id("a-1000"), code: "1000", name: "Cash", accountType: "asset", subType: "current_asset", normalBalance: "debit", isActive: true, currencyCode: "USD" },
  { id: id("a-1200"), code: "1200", name: "Accounts Receivable", accountType: "asset", subType: "current_asset", normalBalance: "debit", isActive: true, currencyCode: "USD" },
  { id: id("a-1300"), code: "1300", name: "Prepaid Expenses", accountType: "asset", subType: "current_asset", normalBalance: "debit", isActive: true, currencyCode: "USD" },
  { id: id("a-1500"), code: "1500", name: "Office Equipment", accountType: "asset", subType: "long_term_asset", normalBalance: "debit", isActive: true, currencyCode: "USD" },
  { id: id("a-1510"), code: "1510", name: "Accumulated Depreciation", accountType: "asset", subType: "long_term_asset", normalBalance: "credit", isActive: true, currencyCode: "USD" },

  { id: id("a-2000"), code: "2000", name: "Accounts Payable", accountType: "liability", subType: "current_liability", normalBalance: "credit", isActive: true, currencyCode: "USD" },
  { id: id("a-2100"), code: "2100", name: "Accrued Liabilities", accountType: "liability", subType: "current_liability", normalBalance: "credit", isActive: true, currencyCode: "USD" },

  { id: id("a-3000"), code: "3000", name: "Owner's Equity", accountType: "equity", subType: "capital", normalBalance: "credit", isActive: true, currencyCode: "USD" },
  { id: id("a-3100"), code: "3100", name: "Retained Earnings", accountType: "equity", subType: "retained", normalBalance: "credit", isActive: true, currencyCode: "USD" },

  { id: id("a-4000"), code: "4000", name: "Service Revenue", accountType: "revenue", subType: "operating", normalBalance: "credit", isActive: true, currencyCode: "USD" },
  { id: id("a-4100"), code: "4100", name: "Interest Income", accountType: "revenue", subType: "non_operating", normalBalance: "credit", isActive: true, currencyCode: "USD" },

  { id: id("a-5000"), code: "5000", name: "Rent Expense", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD" },
  { id: id("a-5100"), code: "5100", name: "Salaries Expense", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD" },
  { id: id("a-5200"), code: "5200", name: "Office Supplies", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD" },
  { id: id("a-5300"), code: "5300", name: "Utilities", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD" },
  { id: id("a-5400"), code: "5400", name: "Professional Fees", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD" },
  { id: id("a-5500"), code: "5500", name: "Depreciation", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD" },
];

export const PERIODS: FiscalPeriod[] = [
  { id: id("p-q1"), name: "2026-Q1", startDate: D("2026-01-01"), endDate: D("2026-03-31"), status: "closed" },
  { id: id("p-q2"), name: "2026-Q2", startDate: D("2026-04-01"), endDate: D("2026-06-30"), status: "open" },
  { id: id("p-q3"), name: "2026-Q3", startDate: D("2026-07-01"), endDate: D("2026-09-30"), status: "open" },
  { id: id("p-q4"), name: "2026-Q4", startDate: D("2026-10-01"), endDate: D("2026-12-31"), status: "open" },
];

export const CUSTOMERS: Customer[] = [
  { id: id("c-001"), code: "CUST-001", name: "Pumpernickel Industries", email: "ap@pumpernickel.co", phone: "(415) 555-2210", billingAddress: "120 Hawthorne St, San Francisco CA 94105", paymentTerms: 30, isActive: true, notes: null },
  { id: id("c-002"), code: "CUST-002", name: "Snickerthorpe Holdings", email: "finance@snickerthorpe.com", phone: "(212) 555-0930", billingAddress: "350 W 42nd St, New York NY 10036", paymentTerms: 45, isActive: true, notes: null },
  { id: id("c-003"), code: "CUST-003", name: "Mumblethrottle Capital", email: "ar@mumblethrottle.io", phone: "(617) 555-7188", billingAddress: "1 Federal St, Boston MA 02110", paymentTerms: 30, isActive: true, notes: null },
  { id: id("c-004"), code: "CUST-004", name: "Tsukimomo Ventures", email: "billing@tsukimomo.jp", phone: "+81 3 5555 4019", billingAddress: "1-1 Marunouchi, Chiyoda-ku, Tokyo", paymentTerms: 60, isActive: true, notes: null },
  { id: id("c-005"), code: "CUST-005", name: "Frogsworth & Partners", email: "invoices@frogsworth.co.uk", phone: "+44 20 5555 0144", billingAddress: "12 Lombard St, London EC3V 9BJ", paymentTerms: 30, isActive: true, notes: null },
];

export const VENDORS: Vendor[] = [
  { id: id("v-001"), code: "VEND-001", name: "Bramblewick Office Supply", email: "orders@bramblewick.com", phone: "(312) 555-2200", address: "401 W Adams St, Chicago IL 60606", paymentTerms: 30, defaultExpenseAccountId: "a-5200", isActive: true, notes: null },
  { id: id("v-002"), code: "VEND-002", name: "Quillfeather Technology", email: "ar@quillfeather.tech", phone: "(206) 555-3304", address: "500 Pine St, Seattle WA 98101", paymentTerms: 30, defaultExpenseAccountId: "a-1500", isActive: true, notes: null },
  { id: id("v-003"), code: "VEND-003", name: "Nettlesome Property Management", email: "leases@nettlesome.com", phone: "(415) 555-9020", address: "55 Sutter St, San Francisco CA 94104", paymentTerms: 30, defaultExpenseAccountId: "a-5000", isActive: true, notes: null },
  { id: id("v-004"), code: "VEND-004", name: "Thundermuffin Consulting", email: "finance@thundermuffin.io", phone: "(404) 555-1122", address: "1 Atlantic Center, Atlanta GA 30309", paymentTerms: 30, defaultExpenseAccountId: "a-5400", isActive: true, notes: null },
  { id: id("v-005"), code: "VEND-005", name: "Wobblesworth Insurance Group", email: "billing@wobblesworth.com", phone: "(860) 555-7710", address: "1 Constitution Plaza, Hartford CT 06103", paymentTerms: 30, defaultExpenseAccountId: "a-5400", isActive: true, notes: null },
];

const INVOICE_LINES = (invoiceId: string, lines: { description: string; quantity: string; unitPrice: string; accountId: string }[]) =>
  lines.map((l, i) => ({
    id: `${invoiceId}-l${i + 1}`,
    invoiceId,
    lineNumber: i + 1,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: (parseFloat(l.quantity) * parseFloat(l.unitPrice)).toFixed(2),
    accountId: l.accountId,
  }));

export const INVOICES: Invoice[] = [
  {
    id: id("i-018"), invoiceNumber: "INV-000018", customerId: "c-004",
    invoiceDate: D("2026-05-11"), dueDate: D("2026-07-10"),
    status: "sent", subtotal: "83250.00", taxAmount: "0.00", total: "83250.00",
    amountPaid: "0.00", balanceDue: "83250.00", currencyCode: "USD",
    notes: "Q2 retainer", journalEntryId: null,
    lines: INVOICE_LINES("i-018", [
      { description: "Strategic advisory — May", quantity: "1", unitPrice: "55000.00", accountId: "a-4000" },
      { description: "Tax review", quantity: "1", unitPrice: "28250.00", accountId: "a-4000" },
    ]),
  },
  {
    id: id("i-017"), invoiceNumber: "INV-000017", customerId: "c-002",
    invoiceDate: D("2026-05-08"), dueDate: D("2026-06-22"),
    status: "sent", subtotal: "62300.00", taxAmount: "0.00", total: "62300.00",
    amountPaid: "0.00", balanceDue: "62300.00", currencyCode: "USD",
    notes: null, journalEntryId: "j-139",
    lines: INVOICE_LINES("i-017", [
      { description: "Audit support — engagement", quantity: "1", unitPrice: "62300.00", accountId: "a-4000" },
    ]),
  },
  {
    id: id("i-016"), invoiceNumber: "INV-000016", customerId: "c-001",
    invoiceDate: D("2026-05-04"), dueDate: D("2026-06-03"),
    status: "partial", subtotal: "48500.00", taxAmount: "0.00", total: "48500.00",
    amountPaid: "10000.00", balanceDue: "38500.00", currencyCode: "USD",
    notes: null, journalEntryId: null,
    lines: INVOICE_LINES("i-016", [
      { description: "Monthly bookkeeping retainer", quantity: "1", unitPrice: "48500.00", accountId: "a-4000" },
    ]),
  },
  {
    id: id("i-015"), invoiceNumber: "INV-000015", customerId: "c-003",
    invoiceDate: D("2026-04-27"), dueDate: D("2026-05-27"),
    status: "sent", subtotal: "21750.00", taxAmount: "0.00", total: "21750.00",
    amountPaid: "0.00", balanceDue: "21750.00", currencyCode: "USD",
    notes: null, journalEntryId: null,
    lines: INVOICE_LINES("i-015", [
      { description: "Quarterly close support", quantity: "1", unitPrice: "21750.00", accountId: "a-4000" },
    ]),
  },
  {
    id: id("i-014"), invoiceNumber: "INV-000014", customerId: "c-005",
    invoiceDate: D("2026-04-20"), dueDate: D("2026-05-20"),
    status: "paid", subtotal: "17500.00", taxAmount: "0.00", total: "17500.00",
    amountPaid: "17500.00", balanceDue: "0.00", currencyCode: "USD",
    notes: null, journalEntryId: "j-141",
    lines: INVOICE_LINES("i-014", [
      { description: "Annual report drafting", quantity: "1", unitPrice: "17500.00", accountId: "a-4000" },
    ]),
  },
  {
    id: id("i-013"), invoiceNumber: "INV-000013", customerId: "c-001",
    invoiceDate: D("2026-03-28"), dueDate: D("2026-04-27"),
    status: "overdue", subtotal: "12400.00", taxAmount: "0.00", total: "12400.00",
    amountPaid: "0.00", balanceDue: "12400.00", currencyCode: "USD",
    notes: null, journalEntryId: null,
    lines: INVOICE_LINES("i-013", [
      { description: "Catch-up bookkeeping", quantity: "1", unitPrice: "12400.00", accountId: "a-4000" },
    ]),
  },
  {
    id: id("i-012"), invoiceNumber: "INV-000012", customerId: "c-002",
    invoiceDate: D("2026-03-14"), dueDate: D("2026-04-28"),
    status: "paid", subtotal: "28200.00", taxAmount: "0.00", total: "28200.00",
    amountPaid: "28200.00", balanceDue: "0.00", currencyCode: "USD",
    notes: null, journalEntryId: "j-134",
    lines: INVOICE_LINES("i-012", [
      { description: "Strategic planning workshop", quantity: "1", unitPrice: "28200.00", accountId: "a-4000" },
    ]),
  },
];

const BILL_LINES = (billId: string, lines: { description: string; quantity: string; unitPrice: string; accountId: string }[]) =>
  lines.map((l, i) => ({
    id: `${billId}-l${i + 1}`,
    billId,
    lineNumber: i + 1,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    amount: (parseFloat(l.quantity) * parseFloat(l.unitPrice)).toFixed(2),
    accountId: l.accountId,
  }));

export const BILLS: Bill[] = [
  {
    id: id("b-058"), billNumber: "BILL-2026-058", vendorId: "v-003",
    billDate: D("2026-05-01"), dueDate: D("2026-05-31"),
    status: "approved", subtotal: "4000.00", taxAmount: "0.00", total: "4000.00",
    amountPaid: "4000.00", balanceDue: "0.00", currencyCode: "USD",
    notes: "May rent", journalEntryId: "j-142",
    lines: BILL_LINES("b-058", [
      { description: "Office rent — May", quantity: "1", unitPrice: "4000.00", accountId: "a-5000" },
    ]),
  },
  {
    id: id("b-057"), billNumber: "BILL-2026-057", vendorId: "v-004",
    billDate: D("2026-05-04"), dueDate: D("2026-06-03"),
    status: "approved", subtotal: "38900.00", taxAmount: "0.00", total: "38900.00",
    amountPaid: "0.00", balanceDue: "38900.00", currencyCode: "USD",
    notes: "Consulting", journalEntryId: "j-138",
    lines: BILL_LINES("b-057", [
      { description: "Tax strategy consulting", quantity: "1", unitPrice: "38900.00", accountId: "a-5400" },
    ]),
  },
  {
    id: id("b-056"), billNumber: "BILL-2026-056", vendorId: "v-002",
    billDate: D("2026-04-28"), dueDate: D("2026-05-28"),
    status: "approved", subtotal: "12800.00", taxAmount: "0.00", total: "12800.00",
    amountPaid: "0.00", balanceDue: "12800.00", currencyCode: "USD",
    notes: "Laptops (4)", journalEntryId: "j-136",
    lines: BILL_LINES("b-056", [
      { description: "Macbook Pro 14\"", quantity: "4", unitPrice: "3200.00", accountId: "a-1500" },
    ]),
  },
  {
    id: id("b-055"), billNumber: "BILL-2026-055", vendorId: "v-001",
    billDate: D("2026-04-21"), dueDate: D("2026-05-21"),
    status: "overdue", subtotal: "1240.00", taxAmount: "0.00", total: "1240.00",
    amountPaid: "0.00", balanceDue: "1240.00", currencyCode: "USD",
    notes: null, journalEntryId: null,
    lines: BILL_LINES("b-055", [
      { description: "Quarterly office supplies", quantity: "1", unitPrice: "1240.00", accountId: "a-5200" },
    ]),
  },
  {
    id: id("b-054"), billNumber: "BILL-2026-054", vendorId: "v-005",
    billDate: D("2026-04-15"), dueDate: D("2026-05-15"),
    status: "overdue", subtotal: "15460.00", taxAmount: "0.00", total: "15460.00",
    amountPaid: "0.00", balanceDue: "15460.00", currencyCode: "USD",
    notes: "E&O premium", journalEntryId: null,
    lines: BILL_LINES("b-054", [
      { description: "Errors & omissions insurance", quantity: "1", unitPrice: "15460.00", accountId: "a-5400" },
    ]),
  },
  {
    id: id("b-053"), billNumber: "BILL-2026-053", vendorId: "v-001",
    billDate: D("2026-03-30"), dueDate: D("2026-04-29"),
    status: "paid", subtotal: "860.00", taxAmount: "0.00", total: "860.00",
    amountPaid: "860.00", balanceDue: "0.00", currencyCode: "USD",
    notes: null, journalEntryId: null,
    lines: BILL_LINES("b-053", [
      { description: "Office supplies", quantity: "1", unitPrice: "860.00", accountId: "a-5200" },
    ]),
  },
];

export const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: id("j-142"), entryNumber: "JE-000142", entryDate: D("2026-05-11"),
    fiscalPeriodId: "p-q2", description: "Monthly office rent payment", reference: "CHK-2418",
    source: "manual", status: "posted", postedAt: "2026-05-11T18:00:00Z", postedBy: "u-margery",
    voidedAt: null, voidReason: null, createdBy: "u-margery",
    createdAt: "2026-05-11T17:55:00Z", updatedAt: "2026-05-11T18:00:00Z",
    lines: [
      { id: "j-142-l1", journalEntryId: "j-142", lineNumber: 1, accountId: "a-5000", description: "May rent", debit: "4000.00", credit: "0.00" },
      { id: "j-142-l2", journalEntryId: "j-142", lineNumber: 2, accountId: "a-1000", description: "Cash payment", debit: "0.00", credit: "4000.00" },
    ],
  },
  {
    id: id("j-141"), entryNumber: "JE-000141", entryDate: D("2026-05-10"),
    fiscalPeriodId: "p-q2", description: "Customer payment received (INV-000014)", reference: "ACH-50220",
    source: "invoice", status: "posted", postedAt: "2026-05-10T15:20:00Z", postedBy: "u-margery",
    voidedAt: null, voidReason: null, createdBy: "u-margery",
    createdAt: "2026-05-10T15:00:00Z", updatedAt: "2026-05-10T15:20:00Z",
    lines: [
      { id: "j-141-l1", journalEntryId: "j-141", lineNumber: 1, accountId: "a-1000", description: "Deposit", debit: "17500.00", credit: "0.00" },
      { id: "j-141-l2", journalEntryId: "j-141", lineNumber: 2, accountId: "a-1200", description: "Apply AR", debit: "0.00", credit: "17500.00" },
    ],
  },
  {
    id: id("j-140"), entryNumber: "JE-000140", entryDate: D("2026-05-09"),
    fiscalPeriodId: "p-q2", description: "Payroll — first half of May", reference: "PAY-202605-1",
    source: "manual", status: "posted", postedAt: "2026-05-09T17:00:00Z", postedBy: "u-margery",
    voidedAt: null, voidReason: null, createdBy: "u-margery",
    createdAt: "2026-05-09T16:30:00Z", updatedAt: "2026-05-09T17:00:00Z",
    lines: [
      { id: "j-140-l1", journalEntryId: "j-140", lineNumber: 1, accountId: "a-5100", description: "Payroll", debit: "28500.00", credit: "0.00" },
      { id: "j-140-l2", journalEntryId: "j-140", lineNumber: 2, accountId: "a-1000", description: "Cash out", debit: "0.00", credit: "28500.00" },
    ],
  },
  {
    id: id("j-139"), entryNumber: "JE-000139", entryDate: D("2026-05-08"),
    fiscalPeriodId: "p-q2", description: "Service invoice issued (INV-000017)", reference: "INV-000017",
    source: "invoice", status: "posted", postedAt: "2026-05-08T12:00:00Z", postedBy: "u-margery",
    voidedAt: null, voidReason: null, createdBy: "u-margery",
    createdAt: "2026-05-08T11:45:00Z", updatedAt: "2026-05-08T12:00:00Z",
    lines: [
      { id: "j-139-l1", journalEntryId: "j-139", lineNumber: 1, accountId: "a-1200", description: "Receivable", debit: "62300.00", credit: "0.00" },
      { id: "j-139-l2", journalEntryId: "j-139", lineNumber: 2, accountId: "a-4000", description: "Service revenue", debit: "0.00", credit: "62300.00" },
    ],
  },
  {
    id: id("j-138"), entryNumber: "JE-000138", entryDate: D("2026-05-04"),
    fiscalPeriodId: "p-q2", description: "Consulting fees — Thundermuffin", reference: "BILL-2026-057",
    source: "bill", status: "draft", postedAt: null, postedBy: null,
    voidedAt: null, voidReason: null, createdBy: "u-margery",
    createdAt: "2026-05-04T10:00:00Z", updatedAt: "2026-05-04T10:00:00Z",
    lines: [
      { id: "j-138-l1", journalEntryId: "j-138", lineNumber: 1, accountId: "a-5400", description: "Pro fees", debit: "38900.00", credit: "0.00" },
      { id: "j-138-l2", journalEntryId: "j-138", lineNumber: 2, accountId: "a-2000", description: "AP", debit: "0.00", credit: "38900.00" },
    ],
  },
  {
    id: id("j-137"), entryNumber: "JE-000137", entryDate: D("2026-05-02"),
    fiscalPeriodId: "p-q2", description: "Utility bill", reference: "BILL-2026-052",
    source: "bill", status: "posted", postedAt: "2026-05-02T14:00:00Z", postedBy: "u-margery",
    voidedAt: null, voidReason: null, createdBy: "u-margery",
    createdAt: "2026-05-02T13:30:00Z", updatedAt: "2026-05-02T14:00:00Z",
    lines: [
      { id: "j-137-l1", journalEntryId: "j-137", lineNumber: 1, accountId: "a-5300", description: "Utilities", debit: "1180.00", credit: "0.00" },
      { id: "j-137-l2", journalEntryId: "j-137", lineNumber: 2, accountId: "a-2000", description: "AP", debit: "0.00", credit: "1180.00" },
    ],
  },
  {
    id: id("j-136"), entryNumber: "JE-000136", entryDate: D("2026-04-28"),
    fiscalPeriodId: "p-q2", description: "Laptops — Quillfeather Technology", reference: "BILL-2026-056",
    source: "bill", status: "posted", postedAt: "2026-04-28T18:00:00Z", postedBy: "u-margery",
    voidedAt: null, voidReason: null, createdBy: "u-margery",
    createdAt: "2026-04-28T17:30:00Z", updatedAt: "2026-04-28T18:00:00Z",
    lines: [
      { id: "j-136-l1", journalEntryId: "j-136", lineNumber: 1, accountId: "a-1500", description: "Equipment", debit: "12800.00", credit: "0.00" },
      { id: "j-136-l2", journalEntryId: "j-136", lineNumber: 2, accountId: "a-2000", description: "AP", debit: "0.00", credit: "12800.00" },
    ],
  },
  {
    id: id("j-135"), entryNumber: "JE-000135", entryDate: D("2026-04-30"),
    fiscalPeriodId: "p-q2", description: "Monthly depreciation", reference: null,
    source: "manual", status: "posted", postedAt: "2026-04-30T20:00:00Z", postedBy: "u-aldous",
    voidedAt: null, voidReason: null, createdBy: "u-aldous",
    createdAt: "2026-04-30T19:30:00Z", updatedAt: "2026-04-30T20:00:00Z",
    lines: [
      { id: "j-135-l1", journalEntryId: "j-135", lineNumber: 1, accountId: "a-5500", description: "Depreciation", debit: "1100.00", credit: "0.00" },
      { id: "j-135-l2", journalEntryId: "j-135", lineNumber: 2, accountId: "a-1510", description: "Accumulated depreciation", debit: "0.00", credit: "1100.00" },
    ],
  },
  {
    id: id("j-134"), entryNumber: "JE-000134", entryDate: D("2026-04-25"),
    fiscalPeriodId: "p-q2", description: "Customer payment received (INV-000012)", reference: "ACH-49801",
    source: "invoice", status: "posted", postedAt: "2026-04-25T15:00:00Z", postedBy: "u-margery",
    voidedAt: null, voidReason: null, createdBy: "u-margery",
    createdAt: "2026-04-25T14:30:00Z", updatedAt: "2026-04-25T15:00:00Z",
    lines: [
      { id: "j-134-l1", journalEntryId: "j-134", lineNumber: 1, accountId: "a-1000", description: "Deposit", debit: "28200.00", credit: "0.00" },
      { id: "j-134-l2", journalEntryId: "j-134", lineNumber: 2, accountId: "a-1200", description: "Apply AR", debit: "0.00", credit: "28200.00" },
    ],
  },
  {
    id: id("j-133"), entryNumber: "JE-000133", entryDate: D("2026-04-20"),
    fiscalPeriodId: "p-q2", description: "Voided test entry", reference: null,
    source: "manual", status: "void", postedAt: null, postedBy: null,
    voidedAt: "2026-04-20T11:00:00Z", voidReason: "Test entry, voided.", createdBy: "u-margery",
    createdAt: "2026-04-20T10:00:00Z", updatedAt: "2026-04-20T11:00:00Z",
    lines: [
      { id: "j-133-l1", journalEntryId: "j-133", lineNumber: 1, accountId: "a-5200", description: "Test", debit: "100.00", credit: "0.00" },
      { id: "j-133-l2", journalEntryId: "j-133", lineNumber: 2, accountId: "a-1000", description: "Test", debit: "0.00", credit: "100.00" },
    ],
  },
];

export const BANK_ACCOUNTS: BankAccount[] = [
  { id: id("ba-001"), name: "Operating Account", accountId: "a-1000", institution: "First National", lastFour: "4521", currencyCode: "USD", isActive: true },
];

export const BANK_TRANSACTIONS: BankTransaction[] = [
  { id: id("bt-001"), bankAccountId: "ba-001", transactionDate: D("2026-05-11"), description: "Wire — Nettlesome Property Mgmt", amount: "-4000.00", reference: "WIRE-99812", isReconciled: true, reconciledAt: "2026-05-11T22:00:00Z", journalEntryId: "j-142" },
  { id: id("bt-002"), bankAccountId: "ba-001", transactionDate: D("2026-05-10"), description: "Deposit — Frogsworth & Partners", amount: "17500.00", reference: "ACH-50220", isReconciled: true, reconciledAt: "2026-05-10T22:00:00Z", journalEntryId: "j-141" },
  { id: id("bt-003"), bankAccountId: "ba-001", transactionDate: D("2026-05-09"), description: "Payroll batch", amount: "-28500.00", reference: "PAY-202605-1", isReconciled: true, reconciledAt: "2026-05-09T22:00:00Z", journalEntryId: "j-140" },
  { id: id("bt-004"), bankAccountId: "ba-001", transactionDate: D("2026-05-06"), description: "Card fee — Wobblesworth", amount: "-145.00", reference: "CARD-77110", isReconciled: false, reconciledAt: null, journalEntryId: null },
  { id: id("bt-005"), bankAccountId: "ba-001", transactionDate: D("2026-05-05"), description: "Deposit — Mumblethrottle", amount: "5400.00", reference: "ACH-50140", isReconciled: false, reconciledAt: null, journalEntryId: null },
  { id: id("bt-006"), bankAccountId: "ba-001", transactionDate: D("2026-05-03"), description: "Bank fee", amount: "-25.00", reference: "FEE-04015", isReconciled: false, reconciledAt: null, journalEntryId: null },
];
