import type {
  Account,
  Asset,
  AssetValueSnapshot,
  Bill,
  BankAccount,
  BankAccountSigner,
  BankTransaction,
  Customer,
  Entity,
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

export const ENTITIES: Entity[] = [
  // Pumpernickel Industries — operating co + family trust
  { id: id("e-001"), code: "ENT-001", name: "Pumpernickel Holdings LLC", clientId: "c-001", kind: "llc", jurisdiction: "Delaware, USA", formationDate: D("2012-06-04"), status: "active", ein: "47-1102841", notes: "Master holding company" },
  { id: id("e-002"), code: "ENT-002", name: "Pumpernickel Family Trust", clientId: "c-001", kind: "trust", jurisdiction: "South Dakota, USA", formationDate: D("2014-11-19"), status: "active", ein: null, notes: "Irrevocable dynasty trust" },
  // Snickerthorpe Holdings — three sub-entities
  { id: id("e-003"), code: "ENT-003", name: "Snickerthorpe Master Trust", clientId: "c-002", kind: "trust", jurisdiction: "Nevada, USA", formationDate: D("2009-03-22"), status: "active", ein: null, notes: null },
  { id: id("e-004"), code: "ENT-004", name: "Snickerthorpe Real Estate LLC", clientId: "c-002", kind: "llc", jurisdiction: "New York, USA", formationDate: D("2016-08-11"), status: "active", ein: "85-2901774", notes: "Manhattan commercial portfolio" },
  { id: id("e-005"), code: "ENT-005", name: "Snickerthorpe Capital Partners", clientId: "c-002", kind: "partnership", jurisdiction: "Delaware, USA", formationDate: D("2018-02-01"), status: "active", ein: "82-4429110", notes: "PE fund vehicle" },
  // Mumblethrottle Capital
  { id: id("e-006"), code: "ENT-006", name: "Mumblethrottle Holdings Inc.", clientId: "c-003", kind: "ccorp", jurisdiction: "Massachusetts, USA", formationDate: D("2007-05-09"), status: "active", ein: "04-3712209", notes: null },
  { id: id("e-007"), code: "ENT-007", name: "Mumblethrottle Charitable Foundation", clientId: "c-003", kind: "foundation", jurisdiction: "Massachusetts, USA", formationDate: D("2011-12-14"), status: "active", ein: "27-0044112", notes: "501(c)(3) private foundation" },
  // Tsukimomo Ventures — single entity (foreign-facing)
  { id: id("e-008"), code: "ENT-008", name: "Tsukimomo USA LLC", clientId: "c-004", kind: "llc", jurisdiction: "Delaware, USA", formationDate: D("2020-09-30"), status: "active", ein: "84-3119008", notes: "US-facing subsidiary of Tokyo parent" },
  // Frogsworth & Partners — UK family
  { id: id("e-009"), code: "ENT-009", name: "Frogsworth Family Office Ltd.", clientId: "c-005", kind: "ccorp", jurisdiction: "United Kingdom", formationDate: D("2005-04-18"), status: "active", ein: null, notes: "UK family investment company" },
  { id: id("e-010"), code: "ENT-010", name: "Frogsworth Heritage Trust", clientId: "c-005", kind: "trust", jurisdiction: "Jersey", formationDate: D("2008-10-02"), status: "dormant", ein: null, notes: "Restructured 2024" },
];

export const ASSETS: Asset[] = [
  // Pumpernickel Holdings LLC
  { id: id("as-001"), name: "401 Pine Tower (Seattle)", kind: "real_estate", entityId: "e-001", currencyCode: "USD", externalRef: "King County 401-PINE", acquiredDate: D("2015-09-12"), notes: "Class A office, 84% leased" },
  { id: id("as-002"), name: "Fidelity Brokerage — Operating", kind: "securities", entityId: "e-001", currencyCode: "USD", externalRef: "FID-X19022", acquiredDate: D("2013-01-04"), notes: null },
  { id: id("as-003"), name: "Operating Cash (Treasury MMF)", kind: "cash", entityId: "e-001", currencyCode: "USD", externalRef: "MMF-9921", acquiredDate: D("2020-04-01"), notes: null },
  // Pumpernickel Family Trust
  { id: id("as-004"), name: "Vanguard Trust Portfolio", kind: "securities", entityId: "e-002", currencyCode: "USD", externalRef: "VGD-T2014", acquiredDate: D("2014-11-20"), notes: "Diversified equity + fixed income" },
  { id: id("as-005"), name: "Coastal Vineyard Property (Sonoma)", kind: "real_estate", entityId: "e-002", currencyCode: "USD", externalRef: "Sonoma-PIN-441-0019", acquiredDate: D("2016-06-15"), notes: "40-acre estate" },
  // Snickerthorpe Master Trust
  { id: id("as-006"), name: "Goldman Sachs Trust Account", kind: "securities", entityId: "e-003", currencyCode: "USD", externalRef: "GS-89441", acquiredDate: D("2009-04-10"), notes: null },
  { id: id("as-007"), name: "Picasso — 'Femme au Chapeau' (1962)", kind: "art", entityId: "e-003", currencyCode: "USD", externalRef: null, acquiredDate: D("2011-10-22"), notes: "Stored at Crozier Vault, Long Island City" },
  // Snickerthorpe Real Estate LLC
  { id: id("as-008"), name: "350 W 42nd St (Manhattan)", kind: "real_estate", entityId: "e-004", currencyCode: "USD", externalRef: "NYC Block-1031 Lot-22", acquiredDate: D("2016-08-30"), notes: "Mixed-use, retail + office" },
  { id: id("as-009"), name: "120 Hawthorne (San Francisco)", kind: "real_estate", entityId: "e-004", currencyCode: "USD", externalRef: "SF-APN-3736-101", acquiredDate: D("2019-03-04"), notes: null },
  // Snickerthorpe Capital Partners
  { id: id("as-010"), name: "Sequoia Fund XII LP Interest", kind: "private_equity", entityId: "e-005", currencyCode: "USD", externalRef: "SEQ-XII-LP-119", acquiredDate: D("2018-02-12"), notes: "12% LP commitment" },
  // Mumblethrottle Holdings Inc.
  { id: id("as-011"), name: "Mumblethrottle Operating Cash", kind: "cash", entityId: "e-006", currencyCode: "USD", externalRef: "BOA-OPER-9012", acquiredDate: D("2007-05-15"), notes: null },
  { id: id("as-012"), name: "Mumblethrottle Brokerage Account", kind: "securities", entityId: "e-006", currencyCode: "USD", externalRef: "SCH-77104", acquiredDate: D("2008-01-08"), notes: null },
  { id: id("as-013"), name: "MeritsoftCo (private holding)", kind: "business_interest", entityId: "e-006", currencyCode: "USD", externalRef: null, acquiredDate: D("2014-07-01"), notes: "51% ownership of SaaS portfolio company" },
  // Mumblethrottle Charitable Foundation
  { id: id("as-014"), name: "Foundation Endowment", kind: "securities", entityId: "e-007", currencyCode: "USD", externalRef: "JPM-FDN-44012", acquiredDate: D("2012-01-10"), notes: "5% spend-rate policy" },
  // Tsukimomo USA LLC
  { id: id("as-015"), name: "Tsukimomo USD Sweep", kind: "cash", entityId: "e-008", currencyCode: "USD", externalRef: "MUFG-USA-3301", acquiredDate: D("2020-09-30"), notes: null },
  { id: id("as-016"), name: "Tsukimomo Patent Portfolio", kind: "intellectual_property", entityId: "e-008", currencyCode: "USD", externalRef: "USPTO-X-22", acquiredDate: D("2021-06-15"), notes: "8 granted patents" },
  // Frogsworth Family Office Ltd. (UK)
  { id: id("as-017"), name: "Frogsworth Equities (UK)", kind: "securities", entityId: "e-009", currencyCode: "USD", externalRef: "LLOYDS-EQ-9921", acquiredDate: D("2006-02-01"), notes: "Reported in USD-equivalent" },
  { id: id("as-018"), name: "12 Lombard St (London)", kind: "real_estate", entityId: "e-009", currencyCode: "USD", externalRef: "UK-LR-Title-NGL-882", acquiredDate: D("2010-11-18"), notes: "Head office building" },
];

export const ASSET_VALUE_SNAPSHOTS: AssetValueSnapshot[] = [
  // Two snapshots per asset — Q1 close + recent. Use ISO strings.
  { id: id("av-001a"), assetId: "as-001", snapshotDate: D("2026-03-31"), value: "18400000.00", currencyCode: "USD", source: "Internal appraisal", notes: null, createdBy: "u-aldous", createdAt: "2026-04-02T15:00:00Z" },
  { id: id("av-001b"), assetId: "as-001", snapshotDate: D("2026-05-01"), value: "18650000.00", currencyCode: "USD", source: "Q2 broker mark", notes: "Lease renewals priced in", createdBy: "u-aldous", createdAt: "2026-05-02T11:00:00Z" },
  { id: id("av-002a"), assetId: "as-002", snapshotDate: D("2026-03-31"), value: "5240000.00", currencyCode: "USD", source: "Fidelity statement", notes: null, createdBy: "u-margery", createdAt: "2026-04-01T20:00:00Z" },
  { id: id("av-002b"), assetId: "as-002", snapshotDate: D("2026-05-09"), value: "5480200.00", currencyCode: "USD", source: "Fidelity statement", notes: null, createdBy: "u-margery", createdAt: "2026-05-10T20:00:00Z" },
  { id: id("av-003"),  assetId: "as-003", snapshotDate: D("2026-05-10"), value: "1240000.00", currencyCode: "USD", source: "Bank balance", notes: null, createdBy: "u-margery", createdAt: "2026-05-10T20:00:00Z" },
  { id: id("av-004a"), assetId: "as-004", snapshotDate: D("2026-03-31"), value: "32750000.00", currencyCode: "USD", source: "Vanguard statement", notes: null, createdBy: "u-aldous", createdAt: "2026-04-02T16:00:00Z" },
  { id: id("av-004b"), assetId: "as-004", snapshotDate: D("2026-05-09"), value: "33120000.00", currencyCode: "USD", source: "Vanguard statement", notes: null, createdBy: "u-aldous", createdAt: "2026-05-10T16:00:00Z" },
  { id: id("av-005"),  assetId: "as-005", snapshotDate: D("2026-04-15"), value: "6800000.00", currencyCode: "USD", source: "Annual appraisal", notes: "Vineyard yield up YoY", createdBy: "u-aldous", createdAt: "2026-04-15T18:00:00Z" },
  { id: id("av-006"),  assetId: "as-006", snapshotDate: D("2026-05-09"), value: "82400000.00", currencyCode: "USD", source: "GS statement", notes: null, createdBy: "u-aldous", createdAt: "2026-05-10T16:30:00Z" },
  { id: id("av-007"),  assetId: "as-007", snapshotDate: D("2026-02-20"), value: "14500000.00", currencyCode: "USD", source: "Christie's appraisal", notes: null, createdBy: "u-eustace", createdAt: "2026-02-20T19:00:00Z" },
  { id: id("av-008"),  assetId: "as-008", snapshotDate: D("2026-05-01"), value: "94000000.00", currencyCode: "USD", source: "Marcus & Millichap mark", notes: null, createdBy: "u-aldous", createdAt: "2026-05-01T17:00:00Z" },
  { id: id("av-009"),  assetId: "as-009", snapshotDate: D("2026-05-01"), value: "21300000.00", currencyCode: "USD", source: "Comparable sale", notes: null, createdBy: "u-aldous", createdAt: "2026-05-01T17:00:00Z" },
  { id: id("av-010"),  assetId: "as-010", snapshotDate: D("2026-03-31"), value: "12500000.00", currencyCode: "USD", source: "GP Q1 capital account", notes: null, createdBy: "u-eustace", createdAt: "2026-04-15T17:00:00Z" },
  { id: id("av-011"),  assetId: "as-011", snapshotDate: D("2026-05-10"), value: "2400000.00", currencyCode: "USD", source: "Bank balance", notes: null, createdBy: "u-margery", createdAt: "2026-05-10T20:00:00Z" },
  { id: id("av-012"),  assetId: "as-012", snapshotDate: D("2026-05-09"), value: "18900000.00", currencyCode: "USD", source: "Schwab statement", notes: null, createdBy: "u-margery", createdAt: "2026-05-10T16:30:00Z" },
  { id: id("av-013"),  assetId: "as-013", snapshotDate: D("2026-03-31"), value: "47500000.00", currencyCode: "USD", source: "Internal DCF", notes: "Last raise priced at $93M post", createdBy: "u-eustace", createdAt: "2026-04-15T17:00:00Z" },
  { id: id("av-014"),  assetId: "as-014", snapshotDate: D("2026-05-09"), value: "62400000.00", currencyCode: "USD", source: "JPM statement", notes: null, createdBy: "u-aldous", createdAt: "2026-05-10T17:00:00Z" },
  { id: id("av-015"),  assetId: "as-015", snapshotDate: D("2026-05-10"), value: "8400000.00", currencyCode: "USD", source: "MUFG balance", notes: null, createdBy: "u-margery", createdAt: "2026-05-10T20:00:00Z" },
  { id: id("av-016"),  assetId: "as-016", snapshotDate: D("2026-03-31"), value: "3200000.00", currencyCode: "USD", source: "Internal valuation", notes: "Royalty-stream model", createdBy: "u-aldous", createdAt: "2026-04-15T17:00:00Z" },
  { id: id("av-017"),  assetId: "as-017", snapshotDate: D("2026-05-09"), value: "41500000.00", currencyCode: "USD", source: "Lloyds statement", notes: null, createdBy: "u-aldous", createdAt: "2026-05-10T17:00:00Z" },
  { id: id("av-018"),  assetId: "as-018", snapshotDate: D("2026-04-30"), value: "28900000.00", currencyCode: "USD", source: "UK valuation report", notes: null, createdBy: "u-aldous", createdAt: "2026-05-01T17:00:00Z" },
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
  { id: id("ba-001"), name: "Thistlewood Operating", accountId: "a-1000", institution: "First National", lastFour: "4521", currencyCode: "USD", isActive: true, entityId: null, clientId: null, currentBalance: "553330.00", balanceAsOf: D("2026-05-12") },
  { id: id("ba-002"), name: "Pumpernickel Holdings Treasury", accountId: "a-1000", institution: "JPMorgan Private Bank", lastFour: "8814", currencyCode: "USD", isActive: true, entityId: "e-001", clientId: "c-001", currentBalance: "1240000.00", balanceAsOf: D("2026-05-10") },
  { id: id("ba-003"), name: "Snickerthorpe Real Estate Operating", accountId: "a-1000", institution: "BNY Mellon", lastFour: "2207", currencyCode: "USD", isActive: true, entityId: "e-004", clientId: "c-002", currentBalance: "4200000.00", balanceAsOf: D("2026-05-09") },
  { id: id("ba-004"), name: "Tsukimomo USD Sweep", accountId: "a-1000", institution: "MUFG Union Bank", lastFour: "3301", currencyCode: "USD", isActive: true, entityId: "e-008", clientId: "c-004", currentBalance: "8400000.00", balanceAsOf: D("2026-05-10") },
];

export const BANK_ACCOUNT_SIGNERS: BankAccountSigner[] = [
  // Thistlewood operating — internal officers
  { id: id("bs-001"), bankAccountId: "ba-001", name: "Aldous Pepperton", email: "aldous@thistlewood.com", title: "Controller", authority: "joint", isPrimary: true, addedDate: D("2022-01-01"), notes: null },
  { id: id("bs-002"), bankAccountId: "ba-001", name: "Eustace Brindleworth", email: "eustace@thistlewood.com", title: "CFO", authority: "sole", isPrimary: false, addedDate: D("2022-01-01"), notes: "Approves wires above $50k" },
  { id: id("bs-003"), bankAccountId: "ba-001", name: "Margery Crumplebottom", email: "margery@thistlewood.com", title: "Bookkeeper", authority: "view_only", isPrimary: false, addedDate: D("2023-06-15"), notes: null },
  // Pumpernickel
  { id: id("bs-004"), bankAccountId: "ba-002", name: "Cordelia Pumpernickel", email: "cordelia@pumpernickel.co", title: "Trustee", authority: "sole", isPrimary: true, addedDate: D("2012-06-04"), notes: null },
  { id: id("bs-005"), bankAccountId: "ba-002", name: "Wadsworth Pumpernickel III", email: "wadsworth@pumpernickel.co", title: "Co-Trustee", authority: "joint", isPrimary: false, addedDate: D("2015-04-19"), notes: "Requires CFO countersignature for transfers > $250k" },
  // Snickerthorpe RE
  { id: id("bs-006"), bankAccountId: "ba-003", name: "Beauregard Snickerthorpe", email: "beau@snickerthorpe.com", title: "Managing Director", authority: "sole", isPrimary: true, addedDate: D("2016-08-30"), notes: null },
  { id: id("bs-007"), bankAccountId: "ba-003", name: "Persephone Snickerthorpe", email: "persephone@snickerthorpe.com", title: "Trustee", authority: "limited", isPrimary: false, addedDate: D("2019-02-10"), notes: "Up to $100k per transaction" },
  // Tsukimomo
  { id: id("bs-008"), bankAccountId: "ba-004", name: "Yoshiro Tsukimomo", email: "yoshiro@tsukimomo.jp", title: "President", authority: "sole", isPrimary: true, addedDate: D("2020-09-30"), notes: "Tokyo-based; wires require 48h cooling period" },
  { id: id("bs-009"), bankAccountId: "ba-004", name: "Akiko Tanabe", email: "akiko@tsukimomo.jp", title: "US Operations Lead", authority: "limited", isPrimary: false, addedDate: D("2022-03-04"), notes: "US payroll only" },
];

export const BANK_TRANSACTIONS: BankTransaction[] = [
  { id: id("bt-001"), bankAccountId: "ba-001", transactionDate: D("2026-05-11"), description: "Wire — Nettlesome Property Mgmt", amount: "-4000.00", reference: "WIRE-99812", isReconciled: true, reconciledAt: "2026-05-11T22:00:00Z", journalEntryId: "j-142" },
  { id: id("bt-002"), bankAccountId: "ba-001", transactionDate: D("2026-05-10"), description: "Deposit — Frogsworth & Partners", amount: "17500.00", reference: "ACH-50220", isReconciled: true, reconciledAt: "2026-05-10T22:00:00Z", journalEntryId: "j-141" },
  { id: id("bt-003"), bankAccountId: "ba-001", transactionDate: D("2026-05-09"), description: "Payroll batch", amount: "-28500.00", reference: "PAY-202605-1", isReconciled: true, reconciledAt: "2026-05-09T22:00:00Z", journalEntryId: "j-140" },
  { id: id("bt-004"), bankAccountId: "ba-001", transactionDate: D("2026-05-06"), description: "Card fee — Wobblesworth", amount: "-145.00", reference: "CARD-77110", isReconciled: false, reconciledAt: null, journalEntryId: null },
  { id: id("bt-005"), bankAccountId: "ba-001", transactionDate: D("2026-05-05"), description: "Deposit — Mumblethrottle", amount: "5400.00", reference: "ACH-50140", isReconciled: false, reconciledAt: null, journalEntryId: null },
  { id: id("bt-006"), bankAccountId: "ba-001", transactionDate: D("2026-05-03"), description: "Bank fee", amount: "-25.00", reference: "FEE-04015", isReconciled: false, reconciledAt: null, journalEntryId: null },
];
