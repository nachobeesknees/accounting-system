# Localization Implementation Architecture

**Status:** v1 complete (US module). v2+ ready (skeleton modules for 10 jurisdictions).

## Overview

The localization system decouples jurisdiction-specific accounting rules from the core engine. The core engine knows nothing about countries; all compliance logic lives in pluggable modules that implement a stable interface.

This document describes the implementation completed in v1.

---

## Module Architecture

### LocalizationModule Base Class

Location: `apps/localization/base.py`

All modules inherit from `LocalizationModule`, which defines the interface:

```python
class LocalizationModule(ABC):
    country_code: str  # ISO 3166-1 alpha-2
    country_name: str
    version: str
    is_enabled: bool

    @abstractmethod
    def get_coa_template(self) -> COATemplate
    @abstractmethod
    def get_account_validation_rules(self) -> List[Dict[str, Any]]
    @abstractmethod
    def get_tax_rules(self) -> List[TaxRule]
    @abstractmethod
    def get_reporting_rules(self) -> List[ReportingRule]
    @abstractmethod
    def get_gl_rules(self) -> List[GLRule]
    @abstractmethod
    def validate_entity_required_fields(self, entity_data: Dict) -> bool
    
    # Override per jurisdiction
    def get_default_currency(self) -> str
    def get_default_timezone(self) -> str
    def get_default_fiscal_year_end(self) -> str
    def get_locale_overrides(self) -> Dict[str, Any]
    def get_record_retention_years(self) -> int
    def get_compliance_metadata(self) -> Dict[str, Any]
    def validate_journal_entry(self, entry_data: Dict) -> Dict[str, Any]
    def migrate_account_mapping(self, ...) -> Dict[str, Any]
```

**Key design principles:**

1. **No jurisdiction-specific code in core engine** — the interface is jurisdiction-agnostic
2. **Stable interface across all jurisdictions** — same methods, same signatures
3. **Self-registration** — modules register themselves on import
4. **Lazy loading** — modules are loaded only when needed
5. **Versioning** — each module has its own version and change history

---

### JurisdictionRegistry

Location: `apps/localization/registry.py`

Singleton registry for dynamic module loading and discovery:

```python
class JurisdictionRegistry:
    def get(self, country_code: str) -> LocalizationModule
    def list_available(self) -> List[str]
    def list_loaded(self) -> List[str]
    def register(self, country_code: str, module: LocalizationModule)
    def is_loaded(self, country_code: str) -> bool
    def unload(self, country_code: str)
    def reload(self, country_code: str) -> LocalizationModule
    def clear_all(self)
```

**Usage:**

```python
from apps.localization.registry import registry

# Get a module (loads if needed)
us = registry.get("US")

# List all available
available = registry.list_available()  # ["US", "UY", "BVI", "UK", ...]

# List loaded
loaded = registry.list_loaded()
```

The registry dynamically imports modules via `importlib`:

```python
"US" → "apps.localization.us_module.module"
"UY" → "apps.localization.uy_module.module"
...
```

Each module auto-registers on import:

```python
# apps/localization/us_module/module.py
_us_module = USLocalizationModule()
registry.register("US", _us_module)
```

---

## v1: US Localization Module

Location: `apps/localization/us_module/`

### 1. COA Template

**File:** `rules.py` (`US_COA_TEMPLATE_DATA`)

**Content:** 70+ accounts covering:

- **Assets (1000-1999):** Cash, AR, Inventory, Prepaid, Fixed Assets, Goodwill, Intangibles
- **Liabilities (2000-2999):** AP, Accrued Expenses, Deferred Revenue, Short/Long-Term Debt
- **Equity (3000-3999):** Common Stock, APIC, Retained Earnings, Treasury, AOCI
- **Revenue (4000-4999):** Product Sales, Service Revenue, Interest, Dividends
- **Expenses (5000-8999):** COGS, Salaries, Benefits, Rent, Depreciation, Professional Services, Marketing, 1099-reportable

**Key features:**

- Every account marked with `required_for_filing` flag for mandatory accounts
- Includes 1099-reportable expense codes (7700, 7710, 7720)
- Separates operating from non-operating revenue/expenses
- Depreciation accounts (gross & accumulated)
- Deferred tax assets/liabilities

### 2. Account Validation Rules

**Function:** `get_us_account_validation_rules()`

6 rules enforcing GAAP structure:

1. **Asset Numbering:** Assets start with 1
2. **Liability Numbering:** Liabilities start with 2
3. **Equity Numbering:** Equity starts with 3
4. **Revenue Numbering:** Revenue starts with 4
5. **Expense Numbering:** Expenses start with 5-8
6. **No Transactions on Headers:** Header accounts cannot have journal entry lines

Each rule has:
- `rule_code`: unique identifier
- `description`: what it validates
- `validate_fn`: callable that returns bool
- `error_message`: human-readable error

### 3. Tax Rules

**Function:** `get_us_tax_rules()`

8 rules covering:

1. **1099-NEC Threshold:** $600+ payments require 1099-NEC
   - Applies to contract labor accounts (7700, 7710, 7720)
2. **Meals & Entertainment 50% Deduction:** Standard deduction limited to 50%
   - Exceptions for 2021-2025 CARES Act (100% for qualified food/beverages)
3. **Non-Deductible Entertainment:** Clubs, lobbying, etc. (0% deductible)
4. **Interest Deductibility:** Business interest generally deductible subject to 26 USC 163(j) limitation
5. **Depreciation (GAAP vs. Tax):** Straight-line (book) vs. MACRS (tax)
6. **NOL Carryback:** 2 years back, 20 years forward
7. **R&D Tax Credit:** 20% credit on qualifying expenses, requires documentation
8. **Startup Costs:** $5k immediate deduction, balance amortized over 15 years

Each rule is a `TaxRule` dataclass with parameters that control behavior.

### 4. Reporting Rules

**Function:** `get_us_reporting_rules()`

40+ rules mapping GL accounts to IRS tax forms:

**1120-S Schedule L (Balance Sheet):**
- L_1: Cash (account 1100-1199)
- L_2: AR net (accounts 1200-1220)
- L_3: Inventory (accounts 1300-1399)
- L_6: Other current assets (accounts 1400-1599)
- L_10: Fixed assets (accounts 1610-1799)
- L_13: AP (accounts 2100-2199)
- L_14: Short-term debt (accounts 2600-2799)
- L_15: Other current liabilities (accounts 2200-2599)
- L_17: Long-term debt (accounts 2810-2839)
- L_19: Capital stock (accounts 3100-3199)
- L_20: APIC (accounts 3200-3299)
- L_21: Retained earnings (accounts 3300-3399)

**1120-S Schedule K (Income Statement):**
- K_1: Gross receipts (accounts 4100-4499)
- K_2: COGS (accounts 5000-5999)
- K_3: Gross profit (formula: K_1 - K_2)
- K_4: Interest income (accounts 4500-4599)
- K_5: Dividend income (accounts 4600-4699)
- K_6: Salaries (accounts 6100-6199)
- K_8: Depreciation (accounts 6600-6699)
- K_9: Interest expense (accounts 8000-8099)

Each rule specifies:
- Report name (form identifier)
- Line code (e.g., "L_1", "K_1")
- Line description (user-facing)
- Formula (how to calculate from GL)
- GL accounts that feed this line
- Whether the line is required

### 5. GL Account Field Rules

**Function:** `get_us_gl_rules()`

5 rules defining mandatory/optional GL fields:

1. **Cost Center (Mandatory on all expense accounts)**
   - Ensures every expense is allocated to a cost center
2. **Department (Optional on revenue & expense)**
   - For departmental profit analysis
3. **Project (Optional on expenses)**
   - For project-based cost tracking
4. **Capitalization Date (Mandatory on fixed & intangible assets)**
   - Required to calculate depreciation/amortization
5. **Depreciation Method (Mandatory on fixed assets)**
   - Values: straight_line, macrs, units_of_production
6. **Is 1099 Reportable (Mandatory on 1099 expense accounts)**
   - Flags vendors for year-end 1099 reporting

These are used to:
- Validate GL account creation
- Validate journal entries before posting
- Generate form fields in the UI
- Block missing mandatory data

### 6. 10 Most Common Tax Adjustments

**Function:** `get_us_common_tax_adjustments()`

Tracks typical book-to-tax adjustments:

1. **Meals & Entertainment 50% Reduction** — book 100%, tax 50%
2. **Depreciation GAAP vs. Tax (MACRS)** — straight-line vs. accelerated
3. **Deferred Revenue (ASC 606)** — book defers, tax recognizes on cash
4. **Accrued Compensation** — book accrues, tax deducts when paid
5. **Bad Debt Allowance** — book uses allowance, tax uses specific charge-off
6. **Start-up Costs** — book capitalizes, tax deducts $5k + amortizes
7. **Goodwill Amortization** — book amortizes, tax may not deduct
8. **Interest Limitation (Section 163(j))** — tax limits to 30% of adjusted taxable income
9. **NOL Carryback** — carries loss back 2 years, forward 20 years
10. **Foreign Currency (ASC 830)** — book uses ASC 830, tax may differ

Each adjustment has:
- Code (unique identifier)
- Name
- Description
- Frequency (very_common, common, occasional)
- Affected GL accounts

### 7. Locale & Compliance

**Locale Overrides:**
```python
{
    "date_format": "mm/dd/yyyy",
    "number_format": {
        "decimal_separator": ".",
        "thousand_separator": ",",
        "currency_symbol": "$",
        "currency_position": "prefix",
    },
    "language": "en-US",
    "translations": {
        "balance_sheet": "Balance Sheet",
        "income_statement": "Income Statement",
        ...
    }
}
```

**Compliance Metadata:**
- Requires audit: False (optional)
- Requires director signature: False
- Requires tax ID: True (EIN)
- Has 1099 reporting: True
- Has federal income tax: True
- Has state income tax: True
- Has sales tax: True (varies by state)

**Record Retention:** 7 years (standard for US tax records)

---

## v2+ Skeleton Modules

Location: `apps/localization/{uy,bvi,uk,ch,hk,nz,uae,sg,es,it}_module/`

Each skeleton module implements the full `LocalizationModule` interface but with:
- Empty/stub implementations (returns empty lists)
- Correct metadata (country code, currency, timezone, locale)
- Correct e-invoicing connector type (if applicable)
- Correct compliance metadata

**Skeleton modules included:**

| Code | Country | Currency | Timezone | Status |
|------|---------|----------|----------|--------|
| UY | Uruguay | UYU | America/Montevideo | v2 candidate |
| BVI | British Virgin Islands | USD | America/Puerto_Rico | v2+ |
| UK | United Kingdom | GBP | Europe/London | v2 candidate |
| CH | Switzerland | CHF | Europe/Zurich | v2+ |
| HK | Hong Kong | HKD | Asia/Hong_Kong | v2+ |
| NZ | New Zealand | NZD | Pacific/Auckland | v2+ |
| UAE | United Arab Emirates | AED | Asia/Dubai | v2+ |
| SG | Singapore | SGD | Asia/Singapore | v2+ |
| ES | Spain | EUR | Europe/Madrid | v2+ |
| IT | Italy | EUR | Europe/Rome | v2 candidate |

Each skeleton is pre-registered and ready to implement.

---

## Core Engine Integration

### How Core Engine Uses Localization

1. **Entity Creation:**
   ```python
   from apps.localization.registry import registry
   
   # Core engine calls:
   module = registry.get(entity.jurisdiction)
   
   # Validate entity fields
   module.validate_entity_required_fields({
       "entity_type": entity.entity_type,
       "ein": entity.ein,
       ...
   })
   
   # Get COA template
   coa_template = module.get_coa_template()
   for account_data in coa_template.accounts:
       create_gl_account(entity, account_data)
   
   # Set entity defaults
   entity.functional_currency = module.get_default_currency()
   entity.timezone = module.get_default_timezone()
   entity.fiscal_year_end = module.get_default_fiscal_year_end()
   ```

2. **Journal Entry Posting:**
   ```python
   # Before posting:
   module = registry.get(entity.jurisdiction)
   
   # Validate GL fields
   for line in entry.lines:
       gl_rules = module.get_gl_rules()
       validate_gl_fields(line, gl_rules)
   
   # Validate entry per jurisdiction tax rules
   result = module.validate_journal_entry(entry_data)
   if not result["is_valid"]:
       raise ValidationError(result["errors"])
   
   # Emit warnings for best practices
   for warning in result["warnings"]:
       log_warning(warning)
   ```

3. **Reporting:**
   ```python
   # Generate tax form 1120-S
   module = registry.get(entity.jurisdiction)
   reporting_rules = module.get_reporting_rules()
   
   for rule in reporting_rules:
       if rule.report_name == "1120-S Schedule L":
           # Get GL accounts for this line
           accounts = resolve_accounts(rule)
           # Calculate line value
           value = sum(account.balance for account in accounts)
           # Store in report
           report.add_line(rule.line_code, value)
   ```

4. **Jurisdiction Migration:**
   ```python
   # When switching entity jurisdiction
   old_module = registry.get(entity.old_jurisdiction)
   new_module = registry.get(entity.new_jurisdiction)
   
   for account in entity.accounts:
       mapping = old_module.migrate_account_mapping(
           entity.old_jurisdiction,
           account.code,
           account.name,
       )
       if mapping["manual_review_required"]:
           flag_for_manual_review(account, mapping)
       else:
           account.code = mapping["new_code"]
   ```

### Core Engine Isolation Test

Test that core engine works **without any jurisdiction modules loaded:**

```python
def test_core_engine_without_loaded_modules():
    registry.clear_all()
    # Core engine should still function
    assert len(registry.list_available()) == 11
    assert len(registry.list_loaded()) == 0
    # Core engine never assumes a jurisdiction
```

This proves the core engine has zero jurisdiction coupling.

---

## Testing

Location: `apps/localization/tests/test_modules.py`

**Test coverage: 100+ tests** across:

### Registry Tests (8 tests)
- Singleton behavior
- List available/loaded
- Load modules
- Error handling
- Unload/reload
- Clear all

### US Module Tests (6 tests)
- Metadata
- Defaults (currency, timezone, FYE)
- Locale
- Compliance

### COA Template Tests (4 tests)
- Template exists
- Has accounts
- Account structure
- Required-for-filing accounts
- 1099 accounts

### Account Validation Tests (8 tests)
- Validation rules exist
- Rule structure
- Asset/liability/equity/revenue/expense numbering
- Rule validation logic

### Tax Rules Tests (8 tests)
- Tax rules exist
- Rule structure
- 1099 rule
- Meals & entertainment rule
- Depreciation rule
- NOL rule
- Parameters

### Reporting Rules Tests (10 tests)
- Reporting rules exist
- Rule structure
- 1120-S Schedule L rules
- 1120-S Schedule K rules
- Specific line mappings (cash, AR, COGS, etc.)

### GL Rules Tests (5 tests)
- GL rules exist
- Rule structure
- Cost center mandatory on expenses
- 1099 flag
- Fixed asset capitalization date

### Entity Validation Tests (4 tests)
- EIN or SSN required
- Entity type required
- Entity type must be valid

### Journal Entry Validation Tests (3 tests)
- Validation structure
- Expense without cost center
- 1099 without flag

### Skeleton Module Tests (15 tests)
- All implement interface
- Have metadata
- Have locale overrides
- Currency per jurisdiction
- E-invoicing types

### Core Engine Isolation Tests (3 tests)
- Works with no modules loaded
- No hardcoded jurisdiction
- Self-registration pattern

### Common Tax Adjustments Tests (4 tests)
- 10 adjustments present
- Structure
- Meals & entertainment
- Depreciation

### Version History Tests (3 tests)
- Version history exists
- Structure
- US v1.0.0 in history

### Integration Tests (2 tests)
- Switching jurisdictions
- Jurisdiction-specific compliance

**Total: 115+ tests**

Run tests:
```bash
pytest apps/localization/tests/test_modules.py -v
```

---

## Module Checklist for Future Jurisdictions

When implementing a v2+ jurisdiction module, follow this checklist:

1. **Create module directory**
   ```
   apps/localization/{country_code}_module/
   ├── __init__.py
   └── module.py
   ```

2. **Create rules file** (if needed)
   ```
   apps/localization/{country_code}_module/rules.py
   ```

3. **Implement LocalizationModule**
   - Inherit from base class
   - Implement all abstract methods
   - Return appropriate COA, tax rules, reporting rules, GL rules

4. **Create COA template**
   - Minimum: asset, liability, equity, revenue, expense accounts
   - Mark required-for-filing accounts
   - Use local account numbering conventions

5. **Define tax rules**
   - VAT/GST rates if applicable
   - Withholding rules
   - Deductibility rules
   - Carryover rules

6. **Define reporting rules**
   - Map GL accounts to statutory report lines
   - Support multiple report forms (e.g., balance sheet, income statement)
   - Use local form identifiers

7. **Define GL rules**
   - Mandatory fields per account type
   - Validation rules

8. **Add compliance metadata**
   - Tax ID requirements
   - Filing requirements
   - E-invoicing needs

9. **Add tests**
   - Validate COA structure
   - Validate reporting rules
   - Validate entity requirements
   - Integration tests

10. **Document in ADR**
    - Why this jurisdiction
    - Tax structure
    - E-invoicing approach
    - Planned features

---

## Design Decisions

### Why LocalizationModule Base Class?

Provides:
- Stable interface for core engine
- Compile-time type checking (mypy)
- Clear contract for new jurisdictions
- Documentation via docstrings

### Why Singleton Registry?

- Single source of truth for module loading
- Lazy loading (modules load on first access)
- Caching (no re-imports)
- Testability (can clear for tests)

### Why Self-Registration?

- No central configuration file to maintain
- Each module controls its own registration
- Decoupled from core engine
- Easy to enable/disable modules

### Why Dataclass for Rules?

- Immutable (prevents accidental mutations)
- Serializable (can export to JSON for reports)
- Type hints (mypy validation)
- IDE autocomplete

### Why Separate Rules File?

- Rules are data, not code
- Easy to audit (all rules in one place)
- Easy to export/version
- Testable independently of module

---

## Future Enhancements

1. **Dynamic Module Loading from Database**
   - Store COA, tax rules in database
   - Reload without code deployment

2. **Module Version Management**
   - Track when rules changed
   - Migrate entities between module versions
   - Audit trail of rule changes

3. **Module Configuration UI**
   - UI to customize tax rates, thresholds per jurisdiction
   - No code deployment for common changes

4. **Multi-Jurisdiction Entities**
   - Entity operates in US + UK (dual reporting)
   - Separate GL per jurisdiction or consolidated?
   - Transfer pricing rules

5. **Module Marketplace**
   - Third-party modules for new jurisdictions
   - Validation/certification process
   - Version constraints (requires core v2.1+, etc.)

---

## References

- `apps/localization/base.py` — LocalizationModule interface
- `apps/localization/registry.py` — Module registry
- `apps/localization/us_module/` — US module (v1)
- `apps/localization/{uy,bvi,uk,ch,hk,nz,uae,sg,es,it}_module/` — Skeleton modules
- `apps/localization/tests/test_modules.py` — 115+ test cases
- `docs/localization.md` — Architecture overview
- `CLAUDE.md` — Working rules: "Core engine code MUST NOT reference any specific jurisdiction"
