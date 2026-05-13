"""Italy localization module skeleton."""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule


class ITLocalizationModule(LocalizationModule):
    """
    Italy localization module skeleton (v2+).

    Scope when implemented:
    - EUR functional currency
    - OIC (Organismi Italiani di Contabilità) / IFRS basis
    - IVA (22% / 10% / 5% / 4%)
    - Withholding (ritenuta d'acconto)
    - SDI (Sistema di Interscambio) e-invoicing integration
    - Bilancio CEE XBRL reporting
    - Libro giornale, Libro inventari
    """

    country_code = "IT"
    country_name = "Italy"
    version = "0.1.0"  # Skeleton
    is_enabled = False

    def get_coa_template(self) -> COATemplate:
        return COATemplate(
            country_code="IT",
            name="Italy COA (Skeleton)",
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
        # TODO: Validate Codice Fiscale and Partita IVA
        return True

    def get_default_currency(self) -> str:
        return "EUR"

    def get_default_timezone(self) -> str:
        return "Europe/Rome"

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
            "language": "it-IT",
            "translations": {
                "balance_sheet": "Bilancio d'Esercizio",
                "income_statement": "Conto Economico",
            },
        }

    def get_e_invoicing_connector_type(self) -> str:
        return "sdi"  # Sistema di Interscambio

    def get_compliance_metadata(self) -> Dict[str, Any]:
        return {
            "requires_codice_fiscale": True,
            "requires_partita_iva": True,
            "has_iva": True,
            "iva_rates": [0.22, 0.10, 0.05, 0.04],
            "has_withholding": True,
            "sdi_e_invoicing_mandatory": True,
            "statutory_books_required": ["libro_giornale", "libro_inventari"],
        }


from ..registry import registry

_it_module = ITLocalizationModule()
registry.register("IT", _it_module)
