"""Spain localization module skeleton."""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule


class ESLocalizationModule(LocalizationModule):
    """
    Spain localization module skeleton (v2+).

    Scope when implemented:
    - EUR functional currency
    - PGC (Plan General de Contabilidad)
    - IVA (21% / 10% / 4%)
    - IRPF withholding on services
    - SII (Suministro Inmediato de Información) VAT integration
    - Modelo 303/390 tax reporting
    - SAF-T export
    """

    country_code = "ES"
    country_name = "Spain"
    version = "0.1.0"  # Skeleton
    is_enabled = False

    def get_coa_template(self) -> COATemplate:
        return COATemplate(
            country_code="ES",
            name="Spain COA (Skeleton)",
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
        return "EUR"

    def get_default_timezone(self) -> str:
        return "Europe/Madrid"

    def get_default_fiscal_year_end(self) -> str:
        return "12-31"

    def get_locale_overrides(self) -> Dict[str, Any]:
        return {
            "date_format": "dd/mm/yyyy",
            "number_format": {
                "decimal_separator": ",",
                "thousand_separator": ".",
                "currency_symbol": "€",
            },
            "language": "es-ES",
            "translations": {
                "balance_sheet": "Balance de Saldos",
                "income_statement": "Cuenta de Pérdidas y Ganancias",
            },
        }

    def get_e_invoicing_connector_type(self) -> str:
        return "sii"  # Suministro Inmediato de Información

    def get_compliance_metadata(self) -> Dict[str, Any]:
        return {
            "has_iva": True,
            "iva_rates": [0.21, 0.10, 0.04],
            "has_irpf_withholding": True,
            "sii_reporting": True,
        }


from ..registry import registry

_es_module = ESLocalizationModule()
registry.register("ES", _es_module)
