"""Uruguay localization module skeleton."""

from typing import Any, Dict, List
from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule


class UYLocalizationModule(LocalizationModule):
    """
    Uruguay localization module skeleton (v2+).

    Scope when implemented:
    - UYU functional currency
    - NIIF/NCA accounting basis
    - IVA (22% standard, 10% reduced, exempt)
    - IRAE income tax
    - DGI reporting exports
    - Libro Diario, Libro Mayor, Libro de Inventarios
    - Spanish (UY) locale
    """

    country_code = "UY"
    country_name = "Uruguay"
    version = "0.1.0"  # Skeleton
    is_enabled = False

    def get_coa_template(self) -> COATemplate:
        """Return skeleton COA template (not implemented)."""
        return COATemplate(
            country_code="UY",
            name="Uruguay COA (Skeleton)",
            description="To be implemented in v2+",
            version="0.1.0",
            accounts=[],
        )

    def get_account_validation_rules(self) -> List[Dict[str, Any]]:
        """Skeleton."""
        return []

    def get_tax_rules(self) -> List[TaxRule]:
        """Skeleton."""
        return []

    def get_reporting_rules(self) -> List[ReportingRule]:
        """Skeleton."""
        return []

    def get_gl_rules(self) -> List[GLRule]:
        """Skeleton."""
        return []

    def validate_entity_required_fields(self, entity_data: Dict[str, Any]) -> bool:
        """Skeleton: UY requires RUT."""
        # TODO: Implement RUT validation
        return True

    def get_default_currency(self) -> str:
        return "UYU"

    def get_default_timezone(self) -> str:
        return "America/Montevideo"

    def get_default_fiscal_year_end(self) -> str:
        return "12-31"

    def get_locale_overrides(self) -> Dict[str, Any]:
        return {
            "date_format": "dd/mm/yyyy",
            "number_format": {
                "decimal_separator": ",",
                "thousand_separator": ".",
                "currency_symbol": "$U",
            },
            "language": "es-UY",
            "translations": {
                "balance_sheet": "Estado de Situación Patrimonial",
                "income_statement": "Estado de Resultados",
            },
        }


from ..registry import registry

_uy_module = UYLocalizationModule()
registry.register("UY", _uy_module)
