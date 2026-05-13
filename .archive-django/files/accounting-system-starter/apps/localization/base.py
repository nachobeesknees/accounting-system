"""
LocalizationModule abstract base class.

All jurisdiction-specific logic must implement this interface.
Core engine queries this interface; it never imports country-specific code directly.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Dict, List, Optional
from datetime import datetime


@dataclass
class COATemplate:
    """Chart of accounts template for a jurisdiction."""

    country_code: str
    name: str
    description: str
    version: str
    accounts: List[Dict[str, Any]] = field(default_factory=list)

    # Account structure: list of dicts with:
    # - code: str (unique account code)
    # - name: str (localized account name)
    # - type: str (asset|liability|equity|revenue|expense)
    # - subtype: str (current|fixed|tangible|intangible, etc.)
    # - is_header: bool (GL header, no transactions)
    # - currency: Optional[str] (default currency for this account, if restricted)
    # - required_for_filing: bool (must be on every entity's CoA)


@dataclass
class TaxRule:
    """Single tax rule for a jurisdiction."""

    code: str  # e.g., "us_sales_tax", "uk_vat", "es_iva"
    name: str
    rule_type: str  # "deductibility", "timing", "withholding", "carryover", "classification"
    description: str
    applies_to: List[str] = field(default_factory=list)  # GL accounts this rule applies to
    parameters: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ReportingRule:
    """How accounts flow into statutory reports for a jurisdiction."""

    report_name: str  # e.g., "1120-S Schedule L", "IVA Return", "MTD VAT"
    line_code: str  # line identifier in the report
    line_description: str
    formula: str  # e.g., "sum(10000:10999)", "avg(balance_sheet_total)"
    accounts: List[str] = field(default_factory=list)  # GL accounts that feed this line
    is_required: bool = True


@dataclass
class GLRule:
    """Mandatory or optional GL account fields per jurisdiction."""

    field_name: str  # e.g., "cost_center", "profit_center", "tax_code"
    is_mandatory: bool
    applies_to_account_types: List[str] = field(
        default_factory=list
    )  # empty = all account types
    allowed_values: Optional[List[str]] = None  # if restricted
    description: str = ""


class LocalizationModule(ABC):
    """
    Abstract base class for jurisdiction-specific accounting modules.

    Each module must implement this interface fully.
    The core engine never imports country-specific code; it queries via this interface.
    """

    # Required class attributes
    country_code: str  # ISO 3166-1 alpha-2, e.g., "US", "UY", "UK"
    country_name: str  # e.g., "United States"
    version: str  # e.g., "1.0.0"
    is_enabled: bool = True

    def __init__(self):
        """Initialize the module. Can be overridden per jurisdiction."""
        pass

    @abstractmethod
    def get_coa_template(self) -> COATemplate:
        """
        Return the starter chart of accounts for this jurisdiction.

        Called when creating a new entity in this jurisdiction.
        """
        pass

    @abstractmethod
    def get_account_validation_rules(self) -> List[Dict[str, Any]]:
        """
        Return account validation rules for this jurisdiction.

        Example:
        - Assets must start with 1
        - Liabilities must start with 2
        - Equity must start with 3
        - Revenue must start with 4
        - Expense must start with 5-8
        - All accounts must have a cost center if account type is in ["5", "6", "7", "8"]

        Returns list of rule dicts:
        {
            "rule_code": str,
            "description": str,
            "validate_fn": callable(account_dict) -> bool,
            "error_message": str,
        }
        """
        pass

    @abstractmethod
    def get_tax_rules(self) -> List[TaxRule]:
        """
        Return tax rules (deductibility, timing, carryovers, withholding, etc.).

        Example for US:
        - 1099-reportable expenses: codes 6000-6999
        - R&D credit categories
        - Meal & entertainment 50% deduction rule
        - Loss carryback/forward rules

        Example for ES (Spain):
        - IVA rates: 21%, 10%, 4%, 0%
        - Reverse charge for certain services
        - IRPF withholding on certain vendors

        Each TaxRule can reference GL accounts it applies to.
        """
        pass

    @abstractmethod
    def get_reporting_rules(self) -> List[ReportingRule]:
        """
        Return rules for how accounts map into statutory reports.

        Example for US:
        - Schedule L (balance sheet): Lines A-K map to specific GL accounts
        - Schedule K-1 (partnership income): Lines 1-22 map to GL accounts
        - 1120-S gross receipts: Line 1c = sum of revenue accounts 4000:4999

        Example for UK:
        - Companies House iXBRL: balance sheet fixed assets = GL 1000:1500
        - MTD VAT: output tax = GL 2200, input tax = GL 2100

        These rules drive:
        1. Mandatory GL account structure (prevents COA that breaks reporting)
        2. Report generation (which GL accounts feed which lines)
        3. Validation (cannot delete an account mapped to a mandatory reporting line)
        """
        pass

    @abstractmethod
    def get_gl_rules(self) -> List[GLRule]:
        """
        Return mandatory/optional GL account field requirements.

        Example for US:
        - All expense accounts must have cost center (mandatory)
        - Revenue accounts may have department (optional)

        Example for IT (Italy):
        - All accounts must have tax classification (mandatory)
        - All journal entries must reference SAP fiscale (tax ID)

        These drive:
        1. Account creation validation
        2. Journal entry posting validation
        3. UI/form generation (which fields to ask for on data entry)
        """
        pass

    @abstractmethod
    def validate_entity_required_fields(self, entity_data: Dict[str, Any]) -> bool:
        """
        Validate that entity has all required jurisdiction-specific fields.

        Example for IT:
        - Entity must have codice_fiscale
        - Entity must have partita_iva

        Example for UK:
        - Entity must have companies_house_number

        Example for UY:
        - Entity must have RUT

        Returns True if valid; raises ValueError with details if not.
        """
        pass

    def get_default_currency(self) -> str:
        """Return default currency code (ISO 4217) for this jurisdiction."""
        return "USD"  # Override per jurisdiction

    def get_default_timezone(self) -> str:
        """Return default timezone for this jurisdiction."""
        return "UTC"  # Override per jurisdiction

    def get_default_fiscal_year_end(self) -> str:
        """Return default fiscal year end as MM-DD, e.g., '12-31'."""
        return "12-31"  # Override per jurisdiction

    def get_locale_overrides(self) -> Dict[str, Any]:
        """
        Return locale-specific formatting and translation overrides.

        Returns:
        {
            "date_format": "mm/dd/yyyy",
            "number_format": {
                "decimal_separator": ".",
                "thousand_separator": ",",
            },
            "translations": {
                "state_of_balance": "Estado de Situación Patrimonial",  # UY
                "income_statement": "Estado de Resultados",  # UY
            }
        }
        """
        return {
            "date_format": "mm/dd/yyyy",
            "number_format": {
                "decimal_separator": ".",
                "thousand_separator": ",",
            },
            "translations": {},
        }

    def get_record_retention_years(self) -> int:
        """Return required record retention period in years."""
        return 7  # Standard, but override per jurisdiction

    def get_e_invoicing_connector_type(self) -> Optional[str]:
        """
        Return e-invoicing connector type if jurisdiction requires it.

        Options: "sdi" (Italy), "sii" (Spain), "mtd" (UK), etc.
        Returns None if no e-invoicing requirement.
        """
        return None

    def get_compliance_metadata(self) -> Dict[str, Any]:
        """
        Return jurisdiction-specific compliance metadata.

        Examples:
        {
            "requires_audit": bool,
            "requires_director_signature": bool,
            "requires_tax_id": bool,
            "tax_id_field_name": str,
            "companies_house_number_required": bool,
        }
        """
        return {}

    def migrate_account_mapping(
        self,
        old_jurisdiction: str,
        old_account_code: str,
        old_account_name: str,
    ) -> Dict[str, Any]:
        """
        Map an account from a prior jurisdiction to this one.

        Called during entity jurisdiction migration.
        Returns mapping suggestion:
        {
            "new_code": str,
            "new_name": str,
            "confidence": float (0.0-1.0),
            "manual_review_required": bool,
        }
        """
        return {
            "new_code": None,
            "new_name": None,
            "confidence": 0.0,
            "manual_review_required": True,
        }

    def validate_journal_entry(
        self, entry_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Validate a journal entry per jurisdiction rules before posting.

        Called before posting. Returns:
        {
            "is_valid": bool,
            "errors": [str],
            "warnings": [str],
        }

        Can check:
        - Tax rule compliance (e.g., 1099 expense categorization)
        - GL rule compliance (mandatory fields present)
        - Account balance reasonableness
        - Reporting rule implications
        """
        return {
            "is_valid": True,
            "errors": [],
            "warnings": [],
        }

    def get_version_history(self) -> List[Dict[str, Any]]:
        """Return version history of this module for audit."""
        return [
            {
                "version": self.version,
                "released": datetime.now().isoformat(),
                "changes": ["Initial version"],
            }
        ]

    def __str__(self) -> str:
        return f"{self.country_name} ({self.country_code}) v{self.version}"

    def __repr__(self) -> str:
        return f"<LocalizationModule {self.country_code} v{self.version}>"
