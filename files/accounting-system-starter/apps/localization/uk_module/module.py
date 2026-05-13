"""United Kingdom localization module skeleton."""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule


class UKLocalizationModule(LocalizationModule):
    """
    UK localization module skeleton (v2+).

    Scope when implemented:
    - GBP functional currency
    - UK GAAP (FRS 102)
    - VAT (20% standard, 5% reduced, zero-rated, exempt)
    - MTD (Making Tax Digital) VAT integration
    - Companies House iXBRL filing
    - Director-signed statutory accounts
    """

    country_code = "UK"
    country_name = "United Kingdom"
    version = "0.1.0"  # Skeleton
    is_enabled = False

    def get_coa_template(self) -> COATemplate:
        return COATemplate(
            country_code="UK",
            name="UK COA (Skeleton)",
            description="To be implemented in v2+",
            version="0.1.0",
            accounts=[],
        )

    def get_account_validation_rules(self) -> List[Dict[str, Any]]:
        return []

    def get_tax_rules(self) -> List[TaxRule]:
        return []

    def get_reporting_rules(self) -> List[ReportingRule]:
        return []

    def get_gl_rules(self) -> List[GLRule]:
        return []

    def validate_entity_required_fields(self, entity_data: Dict[str, Any]) -> bool:
        # TODO: Implement Companies House number validation
        return True

    def get_default_currency(self) -> str:
        return "GBP"

    def get_default_timezone(self) -> str:
        return "Europe/London"

    def get_default_fiscal_year_end(self) -> str:
        return "12-31"

    def get_locale_overrides(self) -> Dict[str, Any]:
        return {
            "date_format": "dd/mm/yyyy",
            "number_format": {
                "decimal_separator": ".",
                "thousand_separator": ",",
                "currency_symbol": "£",
            },
            "language": "en-GB",
        }

    def get_e_invoicing_connector_type(self) -> str:
        return "mtd"  # Making Tax Digital

    def get_compliance_metadata(self) -> Dict[str, Any]:
        return {
            "requires_companies_house_number": True,
            "requires_director_signature": True,
            "has_vat_reporting": True,
            "mtd_vat_required": True,
        }


from ..registry import registry

_uk_module = UKLocalizationModule()
registry.register("UK", _uk_module)
