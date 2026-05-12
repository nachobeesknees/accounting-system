# Localization Architecture

This document defines how the system handles jurisdiction-specific requirements. The pattern: a jurisdiction-agnostic **core engine** plus pluggable **localization modules** per jurisdiction. Same architectural pattern as Microsoft Dynamics 365 Business Central, NetSuite OneWorld, SAP, and Sage Intacct global.

## Why this pattern

The group operates entities across 11 jurisdictions (BVI, US, UY, UK, CH, HK, NZ, UAE, SG, ES, IT). Migrating all of them to the new system at once is unrealistic and unnecessary. The pattern allows:

- **Phased migration** off Business Central jurisdiction by jurisdiction, on Adam's schedule
- **Risk containment** — each jurisdiction validated independently before the next
- **Clean separation** between universal accounting concepts and country-specific compliance
- **No big-bang cutover** — entities migrate when their localization module is ready and parallel-run is clean
- **Future extensibility** — adding a new jurisdiction is a new module, not a core change

## Core engine — jurisdiction-agnostic

The core engine knows nothing about specific countries. Everything in core must work regardless of jurisdiction:

- Multi-entity ledger with multi-tier ownership
- Per-entity chart of accounts with consolidation mapping
- Dimensions (department, class, location, project)
- Multi-currency with FX rate management (ASC 830 translation)
- Periods with open/closed/locked status (any period type, any fiscal year-end)
- Journal entries with full invariants (balance, immutability, audit log)
- AP, AR, banking, fixed assets, intercompany
- Consolidation engine with eliminations and basis adjustments
- Reporting engine for entity-level + consolidated views
- User management with entity-scoped permissions
- i18n framework (Django gettext) ready for any locale

**Critical design rule:** Core engine code MUST NOT contain hardcoded jurisdiction references. No "USD," no "calendar year," no "1099," no "VAT," no "SDI." If a feature is jurisdiction-specific, it lives in a localization module.

## Localization module — jurisdiction-specific

Each jurisdiction is its own Django app under `apps.localization.<country_code>` (e.g., `apps.localization.us`, `apps.localization.uy`, `apps.localization.uk`).

A localization module provides:

### 1. Chart of accounts template
Starter COA that gets imported when creating a new entity in this jurisdiction. Captures the typical account structure expected by local auditors, tax authorities, and statutory filings.

### 2. Tax engine
Tax codes, tax calculation rules, tax-on-tax handling, exempt categories:
- **US:** Sales tax (per state, via integration or manual), 1099-reportable expense categorization
- **UY:** IVA (22% standard, 10% reduced, exempt), IRAE income tax categorization
- **UK:** VAT (20% standard, 5% reduced, zero-rated, exempt), CIS for construction
- **ES:** IVA (21% / 10% / 4%), IRPF withholding on services
- **IT:** IVA (22% / 10% / 5% / 4%), withholding (ritenuta d'acconto)
- **CH:** VAT (8.1% standard, 2.6% reduced), cantonal variations
- **HK:** No VAT/GST, but profits tax categorization
- **SG:** GST (9%)
- **NZ:** GST (15%)
- **UAE:** VAT (5%), corporate tax categorization
- **BVI:** No tax, but economic substance categorization

### 3. Statutory report formats
The specific layouts and electronic formats required by each jurisdiction:
- **US:** Standard GAAP financials; 1099 reports
- **UY:** Balance de saldos, Estado de situación patrimonial, Estado de resultados in NIIF/NCA format; DGI data exports
- **UK:** Companies House iXBRL accounts filing format; MTD VAT submission
- **ES:** Cuentas anuales abreviadas/normales (PGC), Modelo 303/390 for VAT; SAF-T export
- **IT:** Bilancio CEE XBRL; F24 tax payment data; LIPE quarterly VAT
- Others as needed when each is enabled

### 4. E-invoicing integration
Real-time invoice transmission where mandated:
- **IT:** SDI (Sistema di Interscambio) — every B2B invoice cleared via government platform. Mandatory. Either build direct integration or use intermediary (preferred: intermediary like Fattura24, Aruba, or Sphera).
- **ES:** SII (Suministro Inmediato de Información) — VAT records to AEAT within 4 days for larger taxpayers. API integration.
- **UK:** MTD (Making Tax Digital) — VAT returns via API. Required for VAT-registered businesses.
- **UAE:** E-invoicing phased rollout 2026-2027.
- **SG:** InvoiceNow (Peppol-based) — voluntary now, mandatory later.

For e-invoicing, **default to integration with established intermediaries** rather than building direct government integrations. The intermediaries handle format changes, certification, and digital signature requirements.

### 5. Local statutory books
Some jurisdictions require specific book formats with specific layouts:
- **UY:** Libro Diario, Libro Mayor, Libro de Inventarios y Balances (digital rúbrica accepted under recent reforms)
- **ES:** Libros oficiales (Diario, Mayor, Inventario)
- **IT:** Libro giornale, Libro inventari
- **UK:** Statutory accounts with director-signed cover

These are derived from the same underlying ledger data but presented in the locally-required format.

### 6. Locale and language overrides
Each localization module can register:
- Number format (decimal separator, thousand separator, currency symbol placement)
- Date format
- Translation overlays for jurisdiction-specific terminology (e.g., Uruguayan "estado de situación patrimonial" vs. generic Spanish "balance general")
- Default time zone for the jurisdiction

### 7. Compliance metadata
- Mandatory record retention period (varies by jurisdiction)
- Audit firm format expectations (if jurisdiction-specific)
- Required entity attributes (e.g., Italy requires Codice Fiscale, UK requires Companies House number, UY requires RUT)

## Localization module interface

Each module registers itself with the core via a stable interface:

```python
# apps/localization/registry.py
class LocalizationModule:
    country_code: str           # ISO 3166-1 alpha-2
    name: str
    coa_template: COATemplate
    tax_engine: TaxEngine
    statutory_reports: list[StatutoryReport]
    e_invoicing_connector: Optional[EInvoicingConnector]
    statutory_books: list[StatutoryBook]
    locale_overrides: LocaleOverrides
    default_timezone: str
    record_retention_years: int
    entity_required_fields: dict
```

Core engine queries the registry when an entity's jurisdiction is set. It never imports country-specific code directly. New jurisdictions are added by creating a new module and registering it — no core changes required.

## Versioning and updates

Tax laws change. E-invoicing protocols change. COA conventions evolve.

- Each localization module has its own version
- Migrations within a module follow Django's standard pattern but stay confined to that module
- A jurisdictional rule change (e.g., Italy raises IVA standard rate) is a localization-only change — core ledger is unaffected
- The system surfaces the active version of each localization module in admin for audit traceability

## What's in v1

**v1 = Core engine + US localization module.**

US module scope for v1:
- Standard US GAAP COA template
- Sales tax categorization (no Avalara integration in v1 — manual or via integration later)
- 1099-reportable expense tracking and year-end reports
- US date/number format (mm/dd/yyyy, comma thousand separator, period decimal)
- USD default for new US entities (entity can still operate multi-currency)
- US fiscal year defaults
- US Eastern / Central / Mountain / Pacific time zone options

**v1 explicitly does NOT include** localization modules for any other jurisdiction. Non-US entities continue running on Business Central until their localization module is built and parallel-run is clean.

## v2+ priority order

Future localization modules in approximate priority order (subject to revision based on entity activity, audit pressure, and BC pain points):

| Order | Jurisdiction | Module scope highlights |
|---|---|---|
| 1 | **Uruguay** | UYU functional, NIIF/NCA basis, DGI exports, Libro Diario/Mayor, Spanish UY locale |
| 2 | **UK** | GBP functional, UK GAAP (FRS 102), MTD VAT integration, Companies House iXBRL |
| 3 | **Spain** | EUR functional, PGC, SII integration, Modelo 303/390 |
| 4 | **Italy** | EUR functional, OIC, SDI e-invoicing (via intermediary), Bilancio CEE |
| 5 | **Hong Kong** | HKD functional, HKFRS, profits tax categorization (no VAT) |
| 6 | **Singapore** | SGD functional, SFRS, GST, ACRA-aligned reporting |
| 7 | **Switzerland** | CHF functional, Swiss GAAP or IFRS, cantonal tax variation |
| 8 | **UAE** | AED functional, IFRS, VAT, emerging e-invoicing |
| 9 | **New Zealand** | NZD functional, NZ IFRS, GST |
| 10 | **BVI** | USD functional, IFRS-light, economic substance compliance |

Each module estimated at **2-6 weeks of solo + AI build**, with Italy / Spain / UK at the higher end due to e-invoicing complexity.

## Migration from Business Central

For each jurisdiction migration:

1. Build the localization module (2-6 weeks)
2. Configure module per local conventions (CoA, tax codes, etc.)
3. Set up the entity in the new system with opening balances from BC
4. Run parallel (2-3 months recommended; pilot ran 3 months and validated the pattern)
5. Cut over at jurisdiction-appropriate fiscal boundary
6. BC instance for that jurisdiction goes to read-only

BC continues to be the system of record for non-migrated jurisdictions throughout. There is no big-bang global cutover.

## Working rules for Claude Code

1. **Core engine code MUST NOT reference any specific jurisdiction.** No `if country == 'US'`, no hardcoded tax rates, no hardcoded COA codes, no jurisdiction-specific terminology in core.
2. **Anything country-specific lives in `apps.localization.<country_code>`.** If a feature needs to know the country, it queries the localization registry.
3. **The US module is not the "default" — it is a module like any other.** Even though v1 only has US, treat it as one localization among future peers.
4. **Tests verify isolation:** the test suite must include a test that core engine works with NO localization modules loaded (proves no hidden coupling).
5. **New jurisdictions get an ADR.** Before building a new localization module, an Architecture Decision Record documents the framework, tax structure, statutory requirements, and e-invoicing approach.

## Open questions

- [ ] Default time zone handling — per-entity timezone, or per-user, or both?
- [ ] How to handle entities that operate across multiple jurisdictions (e.g., a US entity with UK VAT registration for cross-border sales)?
- [ ] Audit firm relationship per jurisdiction — who is Adam's local contact in each country as those modules go live?
- [ ] BC migration order beyond v2 (Uruguay) — driven by what specifically? Audit pressure? Transaction volume? BC pain?
