import type {
  Account,
  Asset,
  AssetValueSnapshot,
  Bill,
  BankAccount,
  BankAccountSigner,
  BankTransaction,
  Contact,
  ContactLink,
  Currency,
  Customer,
  EmployeeRate,
  Entity,
  EntityFee,
  FeeSchedule,
  FiscalPeriod,
  FxRate,
  Invoice,
  JournalEntry,
  Office,
  PriceList,
  PriceListEntry,
  TimeEntry,
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

export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$", name: "US Dollar", decimals: 2, isBase: true, isActive: true },
  { code: "EUR", symbol: "€", name: "Euro", decimals: 2, isBase: false, isActive: true },
  { code: "GBP", symbol: "£", name: "British Pound", decimals: 2, isBase: false, isActive: true },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", decimals: 0, isBase: false, isActive: true },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", decimals: 2, isBase: false, isActive: true },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc", decimals: 2, isBase: false, isActive: true },
];

// Rates expressed as "foreign per 1 USD" so AUA conversion is value / rate.
export const FX_RATES: FxRate[] = [
  // Recent close (2026-05-12)
  { id: id("fx-001"), currencyCode: "EUR", rateDate: D("2026-05-12"), ratePerBase: "0.92500000", source: "ECB reference", notes: null },
  { id: id("fx-002"), currencyCode: "GBP", rateDate: D("2026-05-12"), ratePerBase: "0.79100000", source: "BOE reference", notes: null },
  { id: id("fx-003"), currencyCode: "JPY", rateDate: D("2026-05-12"), ratePerBase: "156.40000000", source: "BoJ reference", notes: null },
  { id: id("fx-004"), currencyCode: "CAD", rateDate: D("2026-05-12"), ratePerBase: "1.37200000", source: "BoC reference", notes: null },
  { id: id("fx-005"), currencyCode: "CHF", rateDate: D("2026-05-12"), ratePerBase: "0.90400000", source: "SNB reference", notes: null },
  // Month-end April for comparison
  { id: id("fx-006"), currencyCode: "EUR", rateDate: D("2026-04-30"), ratePerBase: "0.93100000", source: "ECB month-end", notes: null },
  { id: id("fx-007"), currencyCode: "GBP", rateDate: D("2026-04-30"), ratePerBase: "0.79800000", source: "BOE month-end", notes: null },
  { id: id("fx-008"), currencyCode: "JPY", rateDate: D("2026-04-30"), ratePerBase: "155.20000000", source: "BoJ month-end", notes: null },
];

export const ACCOUNTS: Account[] = [
  // Firm-level chart of accounts (entityId null)
  { id: id("a-1000"), code: "1000", name: "Cash", accountType: "asset", subType: "current_asset", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-1200"), code: "1200", name: "Accounts Receivable", accountType: "asset", subType: "current_asset", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-1300"), code: "1300", name: "Prepaid Expenses", accountType: "asset", subType: "current_asset", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-1500"), code: "1500", name: "Office Equipment", accountType: "asset", subType: "long_term_asset", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-1510"), code: "1510", name: "Accumulated Depreciation", accountType: "asset", subType: "long_term_asset", normalBalance: "credit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-2000"), code: "2000", name: "Accounts Payable", accountType: "liability", subType: "current_liability", normalBalance: "credit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-2100"), code: "2100", name: "Accrued Liabilities", accountType: "liability", subType: "current_liability", normalBalance: "credit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-3000"), code: "3000", name: "Owner's Equity", accountType: "equity", subType: "capital", normalBalance: "credit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-3100"), code: "3100", name: "Retained Earnings", accountType: "equity", subType: "retained", normalBalance: "credit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-4000"), code: "4000", name: "Service Revenue", accountType: "revenue", subType: "operating", normalBalance: "credit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-4100"), code: "4100", name: "Interest Income", accountType: "revenue", subType: "non_operating", normalBalance: "credit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-5000"), code: "5000", name: "Rent Expense", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-5100"), code: "5100", name: "Salaries Expense", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-5200"), code: "5200", name: "Office Supplies", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-5300"), code: "5300", name: "Utilities", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-5400"), code: "5400", name: "Professional Fees", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },
  { id: id("a-5500"), code: "5500", name: "Depreciation", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: null },

  // ENT-001 (Pumpernickel Holdings LLC) entity-scoped chart — illustrative subset.
  { id: id("a-e001-1000"), code: "1000", name: "Cash — Pumpernickel Holdings", accountType: "asset", subType: "current_asset", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: "e-001" },
  { id: id("a-e001-1200"), code: "1200", name: "AR — Pumpernickel Holdings", accountType: "asset", subType: "current_asset", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: "e-001" },
  { id: id("a-e001-3000"), code: "3000", name: "Owner's Equity", accountType: "equity", subType: "capital", normalBalance: "credit", isActive: true, currencyCode: "USD", entityId: "e-001" },
  { id: id("a-e001-4000"), code: "4000", name: "Rental Income", accountType: "revenue", subType: "operating", normalBalance: "credit", isActive: true, currencyCode: "USD", entityId: "e-001" },
  { id: id("a-e001-5000"), code: "5000", name: "Property OpEx", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: "e-001" },
  { id: id("a-e001-5400"), code: "5400", name: "Professional Fees", accountType: "expense", subType: "operating", normalBalance: "debit", isActive: true, currencyCode: "USD", entityId: "e-001" },
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
  { id: id("e-001"), code: "ENT-001", name: "Pumpernickel Holdings LLC", clientId: "c-001", kind: "llc", jurisdiction: "Delaware, USA", formationDate: D("2012-06-04"), status: "active", ein: "47-1102841", notes: "Master holding company", currencyCode: "USD" },
  { id: id("e-002"), code: "ENT-002", name: "Pumpernickel Family Trust", clientId: "c-001", kind: "trust", jurisdiction: "South Dakota, USA", formationDate: D("2014-11-19"), status: "active", ein: null, notes: "Irrevocable dynasty trust", currencyCode: "USD" },
  // Snickerthorpe Holdings — three sub-entities
  { id: id("e-003"), code: "ENT-003", name: "Snickerthorpe Master Trust", clientId: "c-002", kind: "trust", jurisdiction: "Nevada, USA", formationDate: D("2009-03-22"), status: "active", ein: null, notes: null, currencyCode: "USD" },
  { id: id("e-004"), code: "ENT-004", name: "Snickerthorpe Real Estate LLC", clientId: "c-002", kind: "llc", jurisdiction: "New York, USA", formationDate: D("2016-08-11"), status: "active", ein: "85-2901774", notes: "Manhattan commercial portfolio", currencyCode: "USD" },
  { id: id("e-005"), code: "ENT-005", name: "Snickerthorpe Capital Partners", clientId: "c-002", kind: "partnership", jurisdiction: "Delaware, USA", formationDate: D("2018-02-01"), status: "active", ein: "82-4429110", notes: "PE fund vehicle", currencyCode: "USD" },
  // Mumblethrottle Capital
  { id: id("e-006"), code: "ENT-006", name: "Mumblethrottle Holdings Inc.", clientId: "c-003", kind: "ccorp", jurisdiction: "Massachusetts, USA", formationDate: D("2007-05-09"), status: "active", ein: "04-3712209", notes: null, currencyCode: "USD" },
  { id: id("e-007"), code: "ENT-007", name: "Mumblethrottle Charitable Foundation", clientId: "c-003", kind: "foundation", jurisdiction: "Massachusetts, USA", formationDate: D("2011-12-14"), status: "active", ein: "27-0044112", notes: "501(c)(3) private foundation", currencyCode: "USD" },
  // Tsukimomo Ventures — JPY-functional Tokyo parent
  { id: id("e-008"), code: "ENT-008", name: "Tsukimomo USA LLC", clientId: "c-004", kind: "llc", jurisdiction: "Delaware, USA", formationDate: D("2020-09-30"), status: "active", ein: "84-3119008", notes: "US-facing subsidiary of Tokyo parent", currencyCode: "JPY" },
  // Frogsworth & Partners — UK GBP-functional
  { id: id("e-009"), code: "ENT-009", name: "Frogsworth Family Office Ltd.", clientId: "c-005", kind: "ccorp", jurisdiction: "United Kingdom", formationDate: D("2005-04-18"), status: "active", ein: null, notes: "UK family investment company", currencyCode: "GBP" },
  { id: id("e-010"), code: "ENT-010", name: "Frogsworth Heritage Trust", clientId: "c-005", kind: "trust", jurisdiction: "Jersey", formationDate: D("2008-10-02"), status: "dormant", ein: null, notes: "Restructured 2024", currencyCode: "GBP" },
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

export const OFFICES: Office[] = [
  { id: id("of-001"), code: "OFC-SF", name: "Thistlewood — San Francisco", address: "120 Hawthorne St, San Francisco CA 94105", currencyCode: "USD", isActive: true, notes: "HQ" },
  { id: id("of-002"), code: "OFC-NY", name: "Thistlewood — New York", address: "350 W 42nd St, New York NY 10036", currencyCode: "USD", isActive: true, notes: "East-coast branch" },
];

export const PRICE_LISTS: PriceList[] = [
  // San Francisco — current version 2 (high-volume), historical version 1
  { id: id("pl-001"), officeId: "of-001", name: "Office SF — 2026 Standard", versionNumber: 1, effectiveDate: D("2026-01-01"), isActive: false, isCurrent: false, parentVersionId: null, notes: "Superseded by High-Volume tier" },
  { id: id("pl-002"), officeId: "of-001", name: "Office SF — 2026 High Volume", versionNumber: 2, effectiveDate: D("2026-04-01"), isActive: true, isCurrent: true, parentVersionId: "pl-001", notes: "10% volume discount applied across the board" },
  // New York — single current version
  { id: id("pl-003"), officeId: "of-002", name: "Office NY — 2026 Standard", versionNumber: 1, effectiveDate: D("2026-01-01"), isActive: true, isCurrent: true, parentVersionId: null, notes: null },
];

export const PRICE_LIST_ENTRIES: PriceListEntry[] = [
  // SF v1 — original prices
  { id: id("pe-001"), priceListId: "pl-001", itemType: "entity_fee", itemKey: "llc", label: "LLC annual fee", unitPrice: "12000.00", includedQuantity: "40", notes: null },
  { id: id("pe-002"), priceListId: "pl-001", itemType: "entity_fee", itemKey: "trust", label: "Trust annual fee", unitPrice: "18000.00", includedQuantity: "60", notes: null },
  { id: id("pe-003"), priceListId: "pl-001", itemType: "entity_fee", itemKey: "ccorp", label: "C-Corp annual fee", unitPrice: "22000.00", includedQuantity: "80", notes: null },
  { id: id("pe-004"), priceListId: "pl-001", itemType: "time_rate", itemKey: "Bookkeeper", label: "Bookkeeper hourly", unitPrice: "125.00", includedQuantity: null, notes: null },
  { id: id("pe-005"), priceListId: "pl-001", itemType: "time_rate", itemKey: "Controller", label: "Controller hourly", unitPrice: "250.00", includedQuantity: null, notes: null },
  { id: id("pe-006"), priceListId: "pl-001", itemType: "time_rate", itemKey: "CFO", label: "CFO hourly", unitPrice: "400.00", includedQuantity: null, notes: null },
  // SF v2 — high-volume (10% off entity fees, +included hours)
  { id: id("pe-007"), priceListId: "pl-002", itemType: "entity_fee", itemKey: "llc", label: "LLC annual fee (HV)", unitPrice: "10800.00", includedQuantity: "44", notes: "10% volume discount" },
  { id: id("pe-008"), priceListId: "pl-002", itemType: "entity_fee", itemKey: "trust", label: "Trust annual fee (HV)", unitPrice: "16200.00", includedQuantity: "66", notes: "10% volume discount" },
  { id: id("pe-009"), priceListId: "pl-002", itemType: "entity_fee", itemKey: "ccorp", label: "C-Corp annual fee (HV)", unitPrice: "19800.00", includedQuantity: "88", notes: "10% volume discount" },
  { id: id("pe-010"), priceListId: "pl-002", itemType: "time_rate", itemKey: "Bookkeeper", label: "Bookkeeper hourly", unitPrice: "125.00", includedQuantity: null, notes: null },
  { id: id("pe-011"), priceListId: "pl-002", itemType: "time_rate", itemKey: "Controller", label: "Controller hourly", unitPrice: "250.00", includedQuantity: null, notes: null },
  { id: id("pe-012"), priceListId: "pl-002", itemType: "time_rate", itemKey: "CFO", label: "CFO hourly", unitPrice: "400.00", includedQuantity: null, notes: null },
  { id: id("pe-013"), priceListId: "pl-002", itemType: "service", itemKey: "fund-admin", label: "Fund administration (per fund/yr)", unitPrice: "25000.00", includedQuantity: null, notes: null },
  // NY v1 — premium rates
  { id: id("pe-014"), priceListId: "pl-003", itemType: "entity_fee", itemKey: "llc", label: "LLC annual fee (NY)", unitPrice: "14000.00", includedQuantity: "40", notes: null },
  { id: id("pe-015"), priceListId: "pl-003", itemType: "entity_fee", itemKey: "trust", label: "Trust annual fee (NY)", unitPrice: "21000.00", includedQuantity: "60", notes: null },
  { id: id("pe-016"), priceListId: "pl-003", itemType: "time_rate", itemKey: "Bookkeeper", label: "Bookkeeper hourly (NY)", unitPrice: "150.00", includedQuantity: null, notes: null },
  { id: id("pe-017"), priceListId: "pl-003", itemType: "time_rate", itemKey: "Controller", label: "Controller hourly (NY)", unitPrice: "290.00", includedQuantity: null, notes: null },
  { id: id("pe-018"), priceListId: "pl-003", itemType: "time_rate", itemKey: "CFO", label: "CFO hourly (NY)", unitPrice: "450.00", includedQuantity: null, notes: null },
];

export const CONTACTS: Contact[] = [
  // Clients (mirroring the 5 customers)
  { id: id("co-001"), code: "CT-CLI-001", name: "Pumpernickel Industries", kind: "organization", email: "ap@pumpernickel.co", phone: "(415) 555-2210", address: "120 Hawthorne St, San Francisco CA 94105", notes: null, isClient: true, isVendor: false, isEmployee: false, isIntermediary: false, customerId: "c-001", vendorId: null, userId: null, isActive: true },
  { id: id("co-002"), code: "CT-CLI-002", name: "Snickerthorpe Holdings", kind: "organization", email: "finance@snickerthorpe.com", phone: "(212) 555-0930", address: "350 W 42nd St, New York NY 10036", notes: null, isClient: true, isVendor: false, isEmployee: false, isIntermediary: false, customerId: "c-002", vendorId: null, userId: null, isActive: true },
  { id: id("co-003"), code: "CT-CLI-003", name: "Mumblethrottle Capital", kind: "organization", email: "ar@mumblethrottle.io", phone: "(617) 555-7188", address: "1 Federal St, Boston MA 02110", notes: null, isClient: true, isVendor: false, isEmployee: false, isIntermediary: false, customerId: "c-003", vendorId: null, userId: null, isActive: true },
  { id: id("co-004"), code: "CT-CLI-004", name: "Tsukimomo Ventures", kind: "organization", email: "billing@tsukimomo.jp", phone: "+81 3 5555 4019", address: "1-1 Marunouchi, Chiyoda-ku, Tokyo", notes: "Foreign parent", isClient: true, isVendor: false, isEmployee: false, isIntermediary: false, customerId: "c-004", vendorId: null, userId: null, isActive: true },
  { id: id("co-005"), code: "CT-CLI-005", name: "Frogsworth & Partners", kind: "organization", email: "invoices@frogsworth.co.uk", phone: "+44 20 5555 0144", address: "12 Lombard St, London EC3V 9BJ", notes: null, isClient: true, isVendor: false, isEmployee: false, isIntermediary: false, customerId: "c-005", vendorId: null, userId: null, isActive: true },
  // Vendors (5)
  { id: id("co-006"), code: "CT-VEN-001", name: "Bramblewick Office Supply", kind: "organization", email: "orders@bramblewick.com", phone: "(312) 555-2200", address: "401 W Adams St, Chicago IL 60606", notes: null, isClient: false, isVendor: true, isEmployee: false, isIntermediary: false, customerId: null, vendorId: "v-001", userId: null, isActive: true },
  { id: id("co-007"), code: "CT-VEN-002", name: "Quillfeather Technology", kind: "organization", email: "ar@quillfeather.tech", phone: "(206) 555-3304", address: "500 Pine St, Seattle WA 98101", notes: null, isClient: false, isVendor: true, isEmployee: false, isIntermediary: false, customerId: null, vendorId: "v-002", userId: null, isActive: true },
  { id: id("co-008"), code: "CT-VEN-003", name: "Nettlesome Property Management", kind: "organization", email: "leases@nettlesome.com", phone: "(415) 555-9020", address: "55 Sutter St, San Francisco CA 94104", notes: null, isClient: false, isVendor: true, isEmployee: false, isIntermediary: false, customerId: null, vendorId: "v-003", userId: null, isActive: true },
  { id: id("co-009"), code: "CT-VEN-004", name: "Thundermuffin Consulting", kind: "organization", email: "finance@thundermuffin.io", phone: "(404) 555-1122", address: "1 Atlantic Center, Atlanta GA 30309", notes: null, isClient: false, isVendor: true, isEmployee: false, isIntermediary: false, customerId: null, vendorId: "v-004", userId: null, isActive: true },
  { id: id("co-010"), code: "CT-VEN-005", name: "Wobblesworth Insurance Group", kind: "organization", email: "billing@wobblesworth.com", phone: "(860) 555-7710", address: "1 Constitution Plaza, Hartford CT 06103", notes: null, isClient: false, isVendor: true, isEmployee: false, isIntermediary: false, customerId: null, vendorId: "v-005", userId: null, isActive: true },
  // Employees (mirroring users — except admin which is internal)
  { id: id("co-011"), code: "CT-EMP-001", name: "Margery Crumplebottom", kind: "individual", email: "margery@thistlewood.com", phone: null, address: null, notes: "Bookkeeper", isClient: false, isVendor: false, isEmployee: true, isIntermediary: false, customerId: null, vendorId: null, userId: "u-margery", isActive: true },
  { id: id("co-012"), code: "CT-EMP-002", name: "Aldous Pepperton", kind: "individual", email: "aldous@thistlewood.com", phone: null, address: null, notes: "Controller", isClient: false, isVendor: false, isEmployee: true, isIntermediary: false, customerId: null, vendorId: null, userId: "u-aldous", isActive: true },
  { id: id("co-013"), code: "CT-EMP-003", name: "Eustace Brindleworth", kind: "individual", email: "eustace@thistlewood.com", phone: null, address: null, notes: "CFO", isClient: false, isVendor: false, isEmployee: true, isIntermediary: false, customerId: null, vendorId: null, userId: "u-eustace", isActive: true },
  // Intermediaries (advisors, attorneys etc.)
  { id: id("co-014"), code: "CT-INT-001", name: "Dewey Cheatham & Howe LLP", kind: "organization", email: "trusts@dch.law", phone: "(212) 555-9988", address: "1 World Trade Center, NY 10007", notes: "Trust/estate counsel for Snickerthorpe + Pumpernickel", isClient: false, isVendor: false, isEmployee: false, isIntermediary: true, customerId: null, vendorId: null, userId: null, isActive: true },
  { id: id("co-015"), code: "CT-INT-002", name: "Stannard Wealth Advisors", kind: "organization", email: "ops@stannardwealth.com", phone: "(617) 555-4040", address: "500 Boylston St, Boston MA 02116", notes: "RIA — Mumblethrottle relationship", isClient: false, isVendor: false, isEmployee: false, isIntermediary: true, customerId: null, vendorId: null, userId: null, isActive: true },
  { id: id("co-016"), code: "CT-INT-003", name: "Hadley & Kettlewell CPAs", kind: "organization", email: "tax@hadleyk.com", phone: "(415) 555-7270", address: "100 Pine St, San Francisco CA 94111", notes: "Outside tax — Pumpernickel + Frogsworth", isClient: false, isVendor: false, isEmployee: false, isIntermediary: true, customerId: null, vendorId: null, userId: null, isActive: true },
  // Beneficial owners (individuals also tagged via links)
  { id: id("co-017"), code: "CT-IND-001", name: "Cordelia Pumpernickel", kind: "individual", email: "cordelia@pumpernickel.co", phone: "(415) 555-2200", address: null, notes: "Trustee + beneficial owner", isClient: false, isVendor: false, isEmployee: false, isIntermediary: false, customerId: null, vendorId: null, userId: null, isActive: true },
  { id: id("co-018"), code: "CT-IND-002", name: "Beauregard Snickerthorpe", kind: "individual", email: "beau@snickerthorpe.com", phone: "(212) 555-2002", address: null, notes: "Managing Director", isClient: false, isVendor: false, isEmployee: false, isIntermediary: false, customerId: null, vendorId: null, userId: null, isActive: true },
];

export const CONTACT_LINKS: ContactLink[] = [
  // Client contacts linked to their entities
  { id: id("cl-001"), contactId: "co-001", refType: "entity", refId: "e-001", role: "Owner", notes: null },
  { id: id("cl-002"), contactId: "co-001", refType: "entity", refId: "e-002", role: "Owner", notes: null },
  { id: id("cl-003"), contactId: "co-002", refType: "entity", refId: "e-003", role: "Owner", notes: null },
  { id: id("cl-004"), contactId: "co-002", refType: "entity", refId: "e-004", role: "Owner", notes: null },
  { id: id("cl-005"), contactId: "co-002", refType: "entity", refId: "e-005", role: "Owner", notes: null },
  { id: id("cl-006"), contactId: "co-003", refType: "entity", refId: "e-006", role: "Owner", notes: null },
  { id: id("cl-007"), contactId: "co-003", refType: "entity", refId: "e-007", role: "Owner", notes: null },
  { id: id("cl-008"), contactId: "co-004", refType: "entity", refId: "e-008", role: "Owner", notes: null },
  { id: id("cl-009"), contactId: "co-005", refType: "entity", refId: "e-009", role: "Owner", notes: null },
  { id: id("cl-010"), contactId: "co-005", refType: "entity", refId: "e-010", role: "Owner", notes: null },
  // Intermediaries linked to their client entities
  { id: id("cl-011"), contactId: "co-014", refType: "entity", refId: "e-002", role: "Trust counsel", notes: null },
  { id: id("cl-012"), contactId: "co-014", refType: "entity", refId: "e-003", role: "Trust counsel", notes: null },
  { id: id("cl-013"), contactId: "co-015", refType: "entity", refId: "e-006", role: "RIA", notes: null },
  { id: id("cl-014"), contactId: "co-016", refType: "entity", refId: "e-001", role: "Outside tax preparer", notes: null },
  { id: id("cl-015"), contactId: "co-016", refType: "entity", refId: "e-009", role: "Outside tax preparer", notes: null },
  // Beneficial owners → bank accounts
  { id: id("cl-016"), contactId: "co-017", refType: "bank_account", refId: "ba-002", role: "Primary trustee / signer", notes: null },
  { id: id("cl-017"), contactId: "co-018", refType: "bank_account", refId: "ba-003", role: "Signer", notes: null },
  // Beneficial owners → entities
  { id: id("cl-018"), contactId: "co-017", refType: "entity", refId: "e-002", role: "Trustee", notes: null },
  { id: id("cl-019"), contactId: "co-018", refType: "entity", refId: "e-004", role: "Beneficial owner", notes: null },
];

export const EMPLOYEE_RATES: EmployeeRate[] = [
  { id: id("er-001"), userId: "u-admin", role: "Admin", billableRate: "0.00", costRate: "0.00", effectiveDate: D("2026-01-01"), isDefault: true, notes: "Internal — never billed" },
  { id: id("er-002"), userId: "u-margery", role: "Bookkeeper", billableRate: "125.00", costRate: "55.00", effectiveDate: D("2026-01-01"), isDefault: true, notes: null },
  { id: id("er-003"), userId: "u-aldous", role: "Controller", billableRate: "250.00", costRate: "120.00", effectiveDate: D("2026-01-01"), isDefault: true, notes: null },
  { id: id("er-004"), userId: "u-eustace", role: "CFO", billableRate: "400.00", costRate: "200.00", effectiveDate: D("2026-01-01"), isDefault: true, notes: "Senior advisory" },
];

export const TIME_ENTRIES: TimeEntry[] = [
  // April activity
  { id: id("te-001"), userId: "u-margery", entryDate: D("2026-04-02"), durationHours: "3.50", description: "Q1 close — Pumpernickel Holdings AP review", clientId: "c-001", entityId: "e-001", taskType: "Close support", isBillable: true, rateAtLog: "125.00", invoiceId: null, notes: null },
  { id: id("te-002"), userId: "u-aldous", entryDate: D("2026-04-05"), durationHours: "2.00", description: "Trust accounting review — Pumpernickel Family Trust", clientId: "c-001", entityId: "e-002", taskType: "Trust review", isBillable: true, rateAtLog: "250.00", invoiceId: null, notes: null },
  { id: id("te-003"), userId: "u-margery", entryDate: D("2026-04-08"), durationHours: "4.25", description: "Snickerthorpe RE — rent roll reconciliation", clientId: "c-002", entityId: "e-004", taskType: "Bookkeeping", isBillable: true, rateAtLog: "125.00", invoiceId: null, notes: null },
  { id: id("te-004"), userId: "u-eustace", entryDate: D("2026-04-12"), durationHours: "1.50", description: "Snickerthorpe — strategic planning call", clientId: "c-002", entityId: "e-003", taskType: "Advisory", isBillable: true, rateAtLog: "400.00", invoiceId: null, notes: null },
  { id: id("te-005"), userId: "u-aldous", entryDate: D("2026-04-15"), durationHours: "3.00", description: "Mumblethrottle Foundation — 990-PF prep", clientId: "c-003", entityId: "e-007", taskType: "Tax prep", isBillable: true, rateAtLog: "250.00", invoiceId: null, notes: null },
  { id: id("te-006"), userId: "u-margery", entryDate: D("2026-04-18"), durationHours: "5.00", description: "Tsukimomo USA — payroll setup", clientId: "c-004", entityId: "e-008", taskType: "Payroll", isBillable: true, rateAtLog: "125.00", invoiceId: null, notes: null },
  { id: id("te-007"), userId: "u-aldous", entryDate: D("2026-04-22"), durationHours: "4.50", description: "Frogsworth — UK GAAP / US GAAP reconciliation", clientId: "c-005", entityId: "e-009", taskType: "Reporting", isBillable: true, rateAtLog: "250.00", invoiceId: null, notes: null },
  { id: id("te-008"), userId: "u-margery", entryDate: D("2026-04-25"), durationHours: "2.75", description: "Snickerthorpe Capital Partners — LP capital call processing", clientId: "c-002", entityId: "e-005", taskType: "Bookkeeping", isBillable: true, rateAtLog: "125.00", invoiceId: null, notes: null },
  { id: id("te-009"), userId: "u-eustace", entryDate: D("2026-04-28"), durationHours: "0.75", description: "Pumpernickel — quarterly board call", clientId: "c-001", entityId: "e-001", taskType: "Advisory", isBillable: true, rateAtLog: "400.00", invoiceId: null, notes: null },
  { id: id("te-010"), userId: "u-aldous", entryDate: D("2026-04-30"), durationHours: "2.00", description: "Internal — fee schedule rewrite for 2026", clientId: null, entityId: null, taskType: "Internal", isBillable: false, rateAtLog: null, invoiceId: null, notes: null },
  // May activity
  { id: id("te-011"), userId: "u-margery", entryDate: D("2026-05-01"), durationHours: "3.00", description: "Pumpernickel Holdings — May rent JE", clientId: "c-001", entityId: "e-001", taskType: "Journal entry", isBillable: true, rateAtLog: "125.00", invoiceId: null, notes: null },
  { id: id("te-012"), userId: "u-margery", entryDate: D("2026-05-03"), durationHours: "1.50", description: "Snickerthorpe Master Trust — schedule K-1 questions", clientId: "c-002", entityId: "e-003", taskType: "Tax", isBillable: true, rateAtLog: "125.00", invoiceId: null, notes: null },
  { id: id("te-013"), userId: "u-aldous", entryDate: D("2026-05-04"), durationHours: "2.50", description: "Snickerthorpe RE — depreciation schedule update", clientId: "c-002", entityId: "e-004", taskType: "Tax", isBillable: true, rateAtLog: "250.00", invoiceId: null, notes: null },
  { id: id("te-014"), userId: "u-eustace", entryDate: D("2026-05-05"), durationHours: "1.00", description: "Mumblethrottle — exit modeling MeritsoftCo", clientId: "c-003", entityId: "e-006", taskType: "Advisory", isBillable: true, rateAtLog: "400.00", invoiceId: null, notes: null },
  { id: id("te-015"), userId: "u-margery", entryDate: D("2026-05-06"), durationHours: "4.00", description: "Tsukimomo — May AR follow-ups", clientId: "c-004", entityId: "e-008", taskType: "AR", isBillable: true, rateAtLog: "125.00", invoiceId: null, notes: null },
  { id: id("te-016"), userId: "u-aldous", entryDate: D("2026-05-07"), durationHours: "3.50", description: "Frogsworth Family Office — quarterly investor letter draft", clientId: "c-005", entityId: "e-009", taskType: "Reporting", isBillable: true, rateAtLog: "250.00", invoiceId: null, notes: null },
  { id: id("te-017"), userId: "u-margery", entryDate: D("2026-05-08"), durationHours: "2.25", description: "Internal — onboarding new staff", clientId: null, entityId: null, taskType: "Internal", isBillable: false, rateAtLog: null, invoiceId: null, notes: null },
  { id: id("te-018"), userId: "u-aldous", entryDate: D("2026-05-09"), durationHours: "1.75", description: "Mumblethrottle Foundation — grant approval review", clientId: "c-003", entityId: "e-007", taskType: "Advisory", isBillable: true, rateAtLog: "250.00", invoiceId: null, notes: null },
  { id: id("te-019"), userId: "u-margery", entryDate: D("2026-05-10"), durationHours: "3.00", description: "Pumpernickel Family Trust — distribution memo prep", clientId: "c-001", entityId: "e-002", taskType: "Trust admin", isBillable: true, rateAtLog: "125.00", invoiceId: null, notes: null },
  { id: id("te-020"), userId: "u-eustace", entryDate: D("2026-05-11"), durationHours: "2.00", description: "Snickerthorpe Holdings — annual planning call", clientId: "c-002", entityId: "e-003", taskType: "Advisory", isBillable: true, rateAtLog: "400.00", invoiceId: null, notes: null },
  { id: id("te-021"), userId: "u-aldous", entryDate: D("2026-05-12"), durationHours: "3.00", description: "Frogsworth Heritage Trust — restructure follow-up", clientId: "c-005", entityId: "e-010", taskType: "Trust admin", isBillable: true, rateAtLog: "250.00", invoiceId: null, notes: null },
  { id: id("te-022"), userId: "u-margery", entryDate: D("2026-05-12"), durationHours: "1.75", description: "Pumpernickel Holdings — quarterly review prep", clientId: "c-001", entityId: "e-001", taskType: "Reporting", isBillable: true, rateAtLog: "125.00", invoiceId: null, notes: null },
];

export const FEE_SCHEDULES: FeeSchedule[] = [
  { id: id("fs-001"), name: "LLC Standard — 2026", entityKind: "llc", annualFee: "12000.00", includedHours: "40", applicableYear: 2026, isActive: true, notes: "Annual maintenance + 40 hrs included" },
  { id: id("fs-002"), name: "LLC Premium — 2026", entityKind: "llc", annualFee: "28000.00", includedHours: "100", applicableYear: 2026, isActive: true, notes: "Complex multi-state structures" },
  { id: id("fs-003"), name: "Trust Standard — 2026", entityKind: "trust", annualFee: "18000.00", includedHours: "60", applicableYear: 2026, isActive: true, notes: null },
  { id: id("fs-004"), name: "Trust Premium — 2026", entityKind: "trust", annualFee: "42000.00", includedHours: "150", applicableYear: 2026, isActive: true, notes: "Dynasty / multi-generational" },
  { id: id("fs-005"), name: "S-Corp Standard — 2026", entityKind: "scorp", annualFee: "9500.00", includedHours: "30", applicableYear: 2026, isActive: true, notes: null },
  { id: id("fs-006"), name: "C-Corp Standard — 2026", entityKind: "ccorp", annualFee: "22000.00", includedHours: "80", applicableYear: 2026, isActive: true, notes: null },
  { id: id("fs-007"), name: "Partnership Standard — 2026", entityKind: "partnership", annualFee: "16500.00", includedHours: "55", applicableYear: 2026, isActive: true, notes: null },
  { id: id("fs-008"), name: "Foundation — 2026", entityKind: "foundation", annualFee: "24000.00", includedHours: "90", applicableYear: 2026, isActive: true, notes: "Includes 990-PF prep" },
  { id: id("fs-009"), name: "LLC Standard — 2025", entityKind: "llc", annualFee: "11000.00", includedHours: "40", applicableYear: 2025, isActive: false, notes: "Superseded by 2026 schedule" },
];

export const ENTITY_FEES: EntityFee[] = [
  // 2026 assignments — one per entity
  { id: id("ef-001"), entityId: "e-001", billingYear: 2026, feeScheduleId: "fs-001", annualFee: "12000.00", includedHours: "40", status: "billed", invoiceId: null, notes: null },
  { id: id("ef-002"), entityId: "e-002", billingYear: 2026, feeScheduleId: "fs-004", annualFee: "42000.00", includedHours: "150", status: "billed", invoiceId: null, notes: "Dynasty trust" },
  { id: id("ef-003"), entityId: "e-003", billingYear: 2026, feeScheduleId: "fs-004", annualFee: "42000.00", includedHours: "150", status: "active", invoiceId: null, notes: null },
  { id: id("ef-004"), entityId: "e-004", billingYear: 2026, feeScheduleId: "fs-002", annualFee: "28000.00", includedHours: "100", status: "billed", invoiceId: null, notes: "Multi-state RE" },
  { id: id("ef-005"), entityId: "e-005", billingYear: 2026, feeScheduleId: "fs-007", annualFee: "16500.00", includedHours: "55", status: "active", invoiceId: null, notes: null },
  { id: id("ef-006"), entityId: "e-006", billingYear: 2026, feeScheduleId: "fs-006", annualFee: "22000.00", includedHours: "80", status: "billed", invoiceId: null, notes: null },
  { id: id("ef-007"), entityId: "e-007", billingYear: 2026, feeScheduleId: "fs-008", annualFee: "24000.00", includedHours: "90", status: "active", invoiceId: null, notes: null },
  { id: id("ef-008"), entityId: "e-008", billingYear: 2026, feeScheduleId: "fs-001", annualFee: "14500.00", includedHours: "50", status: "billed", invoiceId: null, notes: "Custom — foreign-parent overhead" },
  { id: id("ef-009"), entityId: "e-009", billingYear: 2026, feeScheduleId: "fs-006", annualFee: "22000.00", includedHours: "80", status: "active", invoiceId: null, notes: null },
  { id: id("ef-010"), entityId: "e-010", billingYear: 2026, feeScheduleId: "fs-003", annualFee: "9000.00", includedHours: "20", status: "draft", invoiceId: null, notes: "Dormant — reduced fee" },
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
    entityId: null,
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
    entityId: null,
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
    entityId: null,
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
    entityId: null,
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
    entityId: null,
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
    entityId: null,
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
    entityId: null,
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
    entityId: null,
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
    entityId: null,
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
    entityId: null,
    lines: [
      { id: "j-133-l1", journalEntryId: "j-133", lineNumber: 1, accountId: "a-5200", description: "Test", debit: "100.00", credit: "0.00" },
      { id: "j-133-l2", journalEntryId: "j-133", lineNumber: 2, accountId: "a-1000", description: "Test", debit: "0.00", credit: "100.00" },
    ],
  },
  // ENT-001 entity-scoped journal entries — Pumpernickel Holdings LLC's own books.
  {
    id: id("j-e001-200"), entryNumber: "JE-E001-000001", entryDate: D("2026-04-01"),
    fiscalPeriodId: "p-q2", description: "Q2 rental income — 401 Pine Tower", reference: "RENT-Q2-001",
    source: "manual", status: "posted", postedAt: "2026-04-01T16:00:00Z", postedBy: "u-aldous",
    voidedAt: null, voidReason: null, createdBy: "u-aldous",
    createdAt: "2026-04-01T15:30:00Z", updatedAt: "2026-04-01T16:00:00Z",
    entityId: "e-001",
    lines: [
      { id: "j-e001-200-l1", journalEntryId: "j-e001-200", lineNumber: 1, accountId: "a-e001-1000", description: "Tenant rent received", debit: "184000.00", credit: "0.00" },
      { id: "j-e001-200-l2", journalEntryId: "j-e001-200", lineNumber: 2, accountId: "a-e001-4000", description: "April rental income", debit: "0.00", credit: "184000.00" },
    ],
  },
  {
    id: id("j-e001-201"), entryNumber: "JE-E001-000002", entryDate: D("2026-04-15"),
    fiscalPeriodId: "p-q2", description: "Property OpEx — landscape + HOA", reference: "OPEX-2026-04",
    source: "manual", status: "posted", postedAt: "2026-04-15T19:00:00Z", postedBy: "u-margery",
    voidedAt: null, voidReason: null, createdBy: "u-margery",
    createdAt: "2026-04-15T18:30:00Z", updatedAt: "2026-04-15T19:00:00Z",
    entityId: "e-001",
    lines: [
      { id: "j-e001-201-l1", journalEntryId: "j-e001-201", lineNumber: 1, accountId: "a-e001-5000", description: "OpEx", debit: "21500.00", credit: "0.00" },
      { id: "j-e001-201-l2", journalEntryId: "j-e001-201", lineNumber: 2, accountId: "a-e001-1000", description: "Cash out", debit: "0.00", credit: "21500.00" },
    ],
  },
  {
    id: id("j-e001-202"), entryNumber: "JE-E001-000003", entryDate: D("2026-05-01"),
    fiscalPeriodId: "p-q2", description: "Q2 rental income — May", reference: "RENT-2026-05",
    source: "manual", status: "posted", postedAt: "2026-05-01T16:00:00Z", postedBy: "u-aldous",
    voidedAt: null, voidReason: null, createdBy: "u-aldous",
    createdAt: "2026-05-01T15:30:00Z", updatedAt: "2026-05-01T16:00:00Z",
    entityId: "e-001",
    lines: [
      { id: "j-e001-202-l1", journalEntryId: "j-e001-202", lineNumber: 1, accountId: "a-e001-1000", description: "Tenant rent received", debit: "184000.00", credit: "0.00" },
      { id: "j-e001-202-l2", journalEntryId: "j-e001-202", lineNumber: 2, accountId: "a-e001-4000", description: "May rental income", debit: "0.00", credit: "184000.00" },
    ],
  },
  {
    id: id("j-e001-203"), entryNumber: "JE-E001-000004", entryDate: D("2026-05-08"),
    fiscalPeriodId: "p-q2", description: "Pro fees — Hadley & Kettlewell tax filing", reference: "PRO-Q1",
    source: "manual", status: "posted", postedAt: "2026-05-08T15:00:00Z", postedBy: "u-aldous",
    voidedAt: null, voidReason: null, createdBy: "u-aldous",
    createdAt: "2026-05-08T14:30:00Z", updatedAt: "2026-05-08T15:00:00Z",
    entityId: "e-001",
    lines: [
      { id: "j-e001-203-l1", journalEntryId: "j-e001-203", lineNumber: 1, accountId: "a-e001-5400", description: "Tax prep fees", debit: "12800.00", credit: "0.00" },
      { id: "j-e001-203-l2", journalEntryId: "j-e001-203", lineNumber: 2, accountId: "a-e001-1000", description: "Cash out", debit: "0.00", credit: "12800.00" },
    ],
  },
];

export const BANK_ACCOUNTS: BankAccount[] = [
  { id: id("ba-001"), name: "Thistlewood Operating", accountId: "a-1000", institution: "First National", lastFour: "4521", currencyCode: "USD", isActive: true, entityId: null, clientId: null, currentBalance: "553330.00", balanceAsOf: D("2026-05-12") },
  { id: id("ba-002"), name: "Pumpernickel Holdings Treasury", accountId: "a-1000", institution: "JPMorgan Private Bank", lastFour: "8814", currencyCode: "USD", isActive: true, entityId: "e-001", clientId: "c-001", currentBalance: "1240000.00", balanceAsOf: D("2026-05-10") },
  { id: id("ba-003"), name: "Snickerthorpe Real Estate Operating", accountId: "a-1000", institution: "BNY Mellon", lastFour: "2207", currencyCode: "USD", isActive: true, entityId: "e-004", clientId: "c-002", currentBalance: "4200000.00", balanceAsOf: D("2026-05-09") },
  { id: id("ba-004"), name: "Tsukimomo USD Sweep", accountId: "a-1000", institution: "MUFG Union Bank", lastFour: "3301", currencyCode: "USD", isActive: true, entityId: "e-008", clientId: "c-004", currentBalance: "8400000.00", balanceAsOf: D("2026-05-10") },
  { id: id("ba-005"), name: "Frogsworth Sterling Operating", accountId: "a-1000", institution: "Lloyds Banking Group", lastFour: "9921", currencyCode: "GBP", isActive: true, entityId: "e-009", clientId: "c-005", currentBalance: "2240000.00", balanceAsOf: D("2026-05-09") },
  { id: id("ba-006"), name: "Tsukimomo Tokyo Yen", accountId: "a-1000", institution: "MUFG Bank, Ltd.", lastFour: "8870", currencyCode: "JPY", isActive: true, entityId: "e-008", clientId: "c-004", currentBalance: "182000000.00", balanceAsOf: D("2026-05-10") },
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
