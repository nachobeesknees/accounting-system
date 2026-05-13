"""
US localization module (v1).

Implements LocalizationModule interface for United States.
"""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule
from .rules import (
    get_us_coa_template,
    get_us_account_validation_rules,
    get_us_tax_rules,
    get_us_reporting_rules,
    get_us_gl_rules,
    get_us_common_tax_adjustments,
)


class USLocalizationModule(LocalizationModule):
    """US localization module (v1) implementing GAAP and tax reporting."""

    country_code = "US"
    country_name = "United States"
    version = "1.0.0"
    is_enabled = True

    def get_coa_template(self) -> COATemplate:
        """Return the US GAAP chart of accounts template."""
        return get_us_coa_template()

    def get_account_validation_rules(self) -> List[Dict[str, Any]]:
        """Return US GAAP account validation rules."""
        return get_us_account_validation_rules()

    def get_tax_rules(self) -> List[TaxRule]:
        """Return US tax rules."""
        return get_us_tax_rules()

    def get_reporting_rules(self) -> List[ReportingRule]:
        """Return US tax form reporting rules."""
        return get_us_reporting_rules()

    def get_gl_rules(self) -> List[GLRule]:
        """Return US GL field requirements."""
        return get_us_gl_rules()

    def validate_entity_required_fields(self, entity_data: Dict[str, Any]) -> bool:
        """
        Validate that entity has required US fields.

        US entities require:
        - EIN (Employer Identification Number) or SSN
        - Entity type (S-Corp, C-Corp, Partnership, Sole Proprietor)
        """
        errors = []

        if "ein" not in entity_data and "ssn" not in entity_data:
            errors.append("US entities require either EIN or SSN")

        if "entity_type" not in entity_data:
            errors.append("US entities require entity_type (e.g., S-Corp, C-Corp, Partnership)")

        entity_type = entity_data.get("entity_type", "").upper()
        valid_types = ["S-CORP", "C-CORP", "PARTNERSHIP", "SOLE-PROPRIETOR", "LLC"]
        if entity_type and entity_type not in valid_types:
            errors.append(
                f"US entity_type must be one of {valid_types}, got {entity_type}"
            )

        if errors:
            raise ValueError("; ".join(errors))

        return True

    def get_default_currency(self) -> str:
        """Return default currency for US entities."""
        return "USD"

    def get_default_timezone(self) -> str:
        """Return default timezone for US entities (Eastern as baseline)."""
        return "America/New_York"

    def get_default_fiscal_year_end(self) -> str:
        """Return default fiscal year end (calendar year)."""
        return "12-31"

    def get_locale_overrides(self) -> Dict[str, Any]:
        """Return US locale formatting."""
        return {
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
                "statement_of_cash_flows": "Statement of Cash Flows",
                "statement_of_shareholders_equity": "Statement of Shareholders' Equity",
            },
        }

    def get_record_retention_years(self) -> int:
        """Return US record retention (7 years for tax, 3 for most other)."""
        return 7

    def get_e_invoicing_connector_type(self) -> str | None:
        """US does not mandate e-invoicing."""
        return None

    def get_compliance_metadata(self) -> Dict[str, Any]:
        """Return US compliance metadata."""
        return {
            "requires_audit": False,  # Optional
            "requires_director_signature": False,  # Not typically required
            "requires_tax_id": True,
            "tax_id_field_name": "ein",
            "companies_house_number_required": False,
            "has_1099_reporting": True,
            "has_federal_income_tax": True,
            "has_state_income_tax": True,  # Varies by state and entity type
            "has_sales_tax": True,  # Varies by state and business
        }

    def migrate_account_mapping(
        self,
        old_jurisdiction: str,
        old_account_code: str,
        old_account_name: str,
    ) -> Dict[str, Any]:
        """Map accounts from prior jurisdiction (Business Central)."""
        # Simplified mapping logic; in practice, more sophisticated
        mapping = {
            "1010": "1100",  # BC Cash -> US Cash
            "1200": "1200",  # BC AR -> US AR
            "1300": "1300",  # BC Inventory -> US Inventory
            "1400": "1400",  # BC Prepaid -> US Prepaid
            "1600": "1610",  # BC Fixed -> US Fixed
            "2100": "2100",  # BC AP -> US AP
            "2200": "2200",  # BC Accrued -> US Accrued
            "2600": "2600",  # BC ST Debt -> US ST Debt
            "2800": "2810",  # BC LT Debt -> US LT Debt
            "3000": "3100",  # BC Equity -> US Equity
            "4000": "4100",  # BC Revenue -> US Revenue
            "5000": "5000",  # BC COGS -> US COGS
            "6000": "6100",  # BC Opex -> US Opex
        }

        new_code = mapping.get(old_account_code)
        if new_code:
            return {
                "new_code": new_code,
                "new_name": old_account_name,  # Keep name as-is for now
                "confidence": 0.8,
                "manual_review_required": False,
            }

        return {
            "new_code": None,
            "new_name": None,
            "confidence": 0.0,
            "manual_review_required": True,
        }

    def validate_journal_entry(self, entry_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate a journal entry per US rules before posting.

        Checks:
        - 1099 accounts have vendor 1099 flag
        - Expense accounts have cost center
        """
        errors = []
        warnings = []

        lines = entry_data.get("lines", [])

        for line in lines:
            account_code = line.get("account_code")

            # 1099 validation
            if account_code and account_code in ["7700", "7710", "7720"]:
                if not line.get("vendor_1099_flag"):
                    warnings.append(
                        f"Account {account_code} is 1099-reportable; vendor should be flagged"
                    )

            # Cost center validation for expenses
            if account_code and account_code.startswith(("5", "6", "7", "8")):
                if not line.get("cost_center"):
                    errors.append(
                        f"Account {account_code} (expense) requires cost center"
                    )

        return {
            "is_valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
        }

    def get_version_history(self) -> List[Dict[str, Any]]:
        """Return US module version history."""
        return [
            {
                "version": "1.0.0",
                "released": "2026-05-12",
                "changes": [
                    "Initial US GAAP module with 1120-S, 1065, 1040-C support",
                    "Account validation rules",
                    "10 most common tax adjustments",
                    "1099 reporting framework",
                    "GL mandatory fields",
                ],
            }
        ]


# Register the module on import
from ..registry import registry

_us_module = USLocalizationModule()
registry.register("US", _us_module)
