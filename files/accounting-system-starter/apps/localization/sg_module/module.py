"""Singapore localization module skeleton."""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule


class SGLocalizationModule(LocalizationModule):
    """
    Singapore localization module skeleton (v2+).

    Scope when implemented:
    - SGD functional currency
    - SFRS (Singapore Financial Reporting Standards)
    - GST (9%)
    - ACRA (Accounting and Corporate Regulatory Authority) reporting
    - InvoiceNow (Peppol-based) e-invoicing
    """

    country_code = "SG"
    country_name = "Singapore"
    version = "0.1.0"  # Skeleton
    is_enabled = False

    def get_coa_template(self) -> COATemplate:
        return COATemplate(
            country_code="SG",
            name="Singapore COA (Skeleton)",
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
        return "SGD"

    def get_default_timezone(self) -> str:
        return "Asia/Singapore"

    def get_default_fiscal_year_end(self) -> str:
        return "12-31"

    def get_locale_overrides(self) -> Dict[str, Any]:
        return {
            "date_format": "dd/mm/yyyy",
            "number_format": {
                "decimal_separator": ".",
                "thousand_separator": ",",
                "currency_symbol": "S$",
            },
            "language": "en-SG",
        }

    def get_e_invoicing_connector_type(self) -> str:
        return "peppol"  # InvoiceNow

    def get_compliance_metadata(self) -> Dict[str, Any]:
        return {
            "has_gst": True,
            "gst_rate": 0.09,
            "acra_reporting": True,
        }


from ..registry import registry

_sg_module = SGLocalizationModule()
registry.register("SG", _sg_module)
