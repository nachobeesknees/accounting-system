"""New Zealand localization module skeleton."""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule


class NZLocalizationModule(LocalizationModule):
    """
    New Zealand localization module skeleton (v2+).

    Scope when implemented:
    - NZD functional currency
    - NZ IFRS (New Zealand International Financial Reporting Standards)
    - GST (15%)
    - IRD (Inland Revenue) reporting
    """

    country_code = "NZ"
    country_name = "New Zealand"
    version = "0.1.0"  # Skeleton
    is_enabled = False

    def get_coa_template(self) -> COATemplate:
        return COATemplate(
            country_code="NZ",
            name="New Zealand COA (Skeleton)",
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
        return "NZD"

    def get_default_timezone(self) -> str:
        return "Pacific/Auckland"

    def get_default_fiscal_year_end(self) -> str:
        return "03-31"  # NZ often uses March year-end

    def get_locale_overrides(self) -> Dict[str, Any]:
        return {
            "date_format": "dd/mm/yyyy",
            "number_format": {
                "decimal_separator": ".",
                "thousand_separator": ",",
                "currency_symbol": "NZ$",
            },
            "language": "en-NZ",
        }

    def get_compliance_metadata(self) -> Dict[str, Any]:
        return {
            "has_gst": True,
            "gst_rate": 0.15,
        }


from ..registry import registry

_nz_module = NZLocalizationModule()
registry.register("NZ", _nz_module)
