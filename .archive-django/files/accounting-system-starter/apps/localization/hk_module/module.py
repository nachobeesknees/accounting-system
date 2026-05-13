"""Hong Kong localization module skeleton."""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule


class HKLocalizationModule(LocalizationModule):
    """
    Hong Kong localization module skeleton (v2+).

    Scope when implemented:
    - HKD functional currency
    - HKFRS (Hong Kong Financial Reporting Standards)
    - Profits tax (no VAT/GST)
    - IRD (Inland Revenue Department) reporting
    """

    country_code = "HK"
    country_name = "Hong Kong"
    version = "0.1.0"  # Skeleton
    is_enabled = False

    def get_coa_template(self) -> COATemplate:
        return COATemplate(
            country_code="HK",
            name="Hong Kong COA (Skeleton)",
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
        return "HKD"

    def get_default_timezone(self) -> str:
        return "Asia/Hong_Kong"

    def get_default_fiscal_year_end(self) -> str:
        return "12-31"

    def get_locale_overrides(self) -> Dict[str, Any]:
        return {
            "date_format": "dd/mm/yyyy",
            "number_format": {
                "decimal_separator": ".",
                "thousand_separator": ",",
                "currency_symbol": "HK$",
            },
            "language": "zh-HK",
        }

    def get_compliance_metadata(self) -> Dict[str, Any]:
        return {
            "has_profits_tax": True,
            "no_vat_gst": True,
        }


from ..registry import registry

_hk_module = HKLocalizationModule()
registry.register("HK", _hk_module)
