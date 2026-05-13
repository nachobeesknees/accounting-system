"""Switzerland localization module skeleton."""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule


class CHLocalizationModule(LocalizationModule):
    """
    Switzerland localization module skeleton (v2+).

    Scope when implemented:
    - CHF functional currency
    - Swiss GAAP or IFRS
    - VAT (8.1% standard, 2.6% reduced, cantonal variations)
    - Cantonal tax variations
    """

    country_code = "CH"
    country_name = "Switzerland"
    version = "0.1.0"  # Skeleton
    is_enabled = False

    def get_coa_template(self) -> COATemplate:
        return COATemplate(
            country_code="CH",
            name="Switzerland COA (Skeleton)",
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
        return "CHF"

    def get_default_timezone(self) -> str:
        return "Europe/Zurich"

    def get_default_fiscal_year_end(self) -> str:
        return "12-31"

    def get_locale_overrides(self) -> Dict[str, Any]:
        return {
            "date_format": "dd.mm.yyyy",
            "number_format": {
                "decimal_separator": ".",
                "thousand_separator": "'",
                "currency_symbol": "CHF",
            },
            "language": "de-CH",
        }

    def get_compliance_metadata(self) -> Dict[str, Any]:
        return {
            "has_cantonal_taxes": True,
            "has_vat": True,
        }


from ..registry import registry

_ch_module = CHLocalizationModule()
registry.register("CH", _ch_module)
