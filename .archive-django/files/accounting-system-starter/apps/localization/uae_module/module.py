"""United Arab Emirates localization module skeleton."""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule


class UAELocalizationModule(LocalizationModule):
    """
    UAE localization module skeleton (v2+).

    Scope when implemented:
    - AED functional currency
    - IFRS basis
    - VAT (5%)
    - Corporate tax (emerging)
    - E-invoicing phased rollout 2026-2027
    """

    country_code = "UAE"
    country_name = "United Arab Emirates"
    version = "0.1.0"  # Skeleton
    is_enabled = False

    def get_coa_template(self) -> COATemplate:
        return COATemplate(
            country_code="UAE",
            name="UAE COA (Skeleton)",
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
        return True

    def get_default_currency(self) -> str:
        return "AED"

    def get_default_timezone(self) -> str:
        return "Asia/Dubai"

    def get_default_fiscal_year_end(self) -> str:
        return "12-31"

    def get_locale_overrides(self) -> Dict[str, Any]:
        return {
            "date_format": "dd/mm/yyyy",
            "number_format": {
                "decimal_separator": ".",
                "thousand_separator": ",",
                "currency_symbol": "د.إ",
            },
            "language": "ar-AE",
        }

    def get_compliance_metadata(self) -> Dict[str, Any]:
        return {
            "has_vat": True,
            "vat_rate": 0.05,
            "e_invoicing_planned": True,
        }


from ..registry import registry

_uae_module = UAELocalizationModule()
registry.register("UAE", _uae_module)
