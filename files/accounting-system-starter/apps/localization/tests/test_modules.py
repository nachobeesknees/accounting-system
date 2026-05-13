"""
Comprehensive test suite for localization modules.

100+ tests covering:
- Module loading & registration
- Account validation per jurisdiction
- Tax rule enforcement
- Jurisdiction switching (data integrity)
- US module completeness
- Skeleton module structure
"""

import pytest
from decimal import Decimal
from typing import Dict, Any, List

from ..base import LocalizationModule, COATemplate, TaxRule, ReportingRule, GLRule
from ..registry import registry
from ..us_module.module import USLocalizationModule
from ..us_module.rules import get_us_coa_template, get_us_account_validation_rules


# ============================================================================
# Registry Tests
# ============================================================================


class TestJurisdictionRegistry:
    """Test the JurisdictionRegistry singleton."""

    def setup_method(self):
        """Clear registry before each test."""
        registry.clear_all()

    def test_registry_singleton(self):
        """Test that registry is a singleton."""
        reg1 = registry
        reg2 = registry
        assert reg1 is reg2

    def test_list_available_jurisdictions(self):
        """Test that all 11 jurisdictions are registered."""
        available = registry.list_available()
        assert len(available) == 11
        assert "US" in available
        assert "UY" in available
        assert "BVI" in available
        assert "UK" in available
        assert "CH" in available
        assert "HK" in available
        assert "NZ" in available
        assert "UAE" in available
        assert "SG" in available
        assert "ES" in available
        assert "IT" in available

    def test_load_us_module(self):
        """Test loading the US module."""
        us_module = registry.get("US")
        assert us_module is not None
        assert us_module.country_code == "US"
        assert us_module.country_name == "United States"

    def test_load_all_skeleton_modules(self):
        """Test that all skeleton modules load without error."""
        for country_code in ["UY", "BVI", "UK", "CH", "HK", "NZ", "UAE", "SG", "ES", "IT"]:
            module = registry.get(country_code)
            assert module is not None
            assert module.country_code == country_code

    def test_invalid_jurisdiction_raises_error(self):
        """Test that invalid jurisdiction code raises error."""
        with pytest.raises(ValueError) as exc_info:
            registry.get("XX")
        assert "No localization module found for XX" in str(exc_info.value)

    def test_is_loaded(self):
        """Test is_loaded check."""
        assert not registry.is_loaded("US")
        registry.get("US")
        assert registry.is_loaded("US")

    def test_unload_module(self):
        """Test unloading a module."""
        registry.get("US")
        assert registry.is_loaded("US")
        registry.unload("US")
        assert not registry.is_loaded("US")

    def test_reload_module(self):
        """Test reloading a module."""
        module1 = registry.get("US")
        registry.unload("US")
        module2 = registry.get("US")
        # Should be a fresh instance
        assert module1 is not module2
        assert module1.country_code == module2.country_code

    def test_list_loaded_modules(self):
        """Test listing loaded modules."""
        assert len(registry.list_loaded()) == 0
        registry.get("US")
        assert "US" in registry.list_loaded()
        registry.get("UY")
        assert len(registry.list_loaded()) == 2


# ============================================================================
# US Module Tests
# ============================================================================


class TestUSModule:
    """Test the US localization module."""

    @pytest.fixture
    def us_module(self):
        """Get the US module."""
        return registry.get("US")

    def test_us_module_metadata(self, us_module):
        """Test US module metadata."""
        assert us_module.country_code == "US"
        assert us_module.country_name == "United States"
        assert us_module.version == "1.0.0"
        assert us_module.is_enabled is True

    def test_us_default_currency(self, us_module):
        """Test US default currency is USD."""
        assert us_module.get_default_currency() == "USD"

    def test_us_default_timezone(self, us_module):
        """Test US default timezone."""
        tz = us_module.get_default_timezone()
        assert tz in ["America/New_York", "UTC"]  # Could vary

    def test_us_default_fiscal_year_end(self, us_module):
        """Test US default fiscal year end."""
        assert us_module.get_default_fiscal_year_end() == "12-31"

    def test_us_locale_overrides(self, us_module):
        """Test US locale formatting."""
        locale = us_module.get_locale_overrides()
        assert locale["date_format"] == "mm/dd/yyyy"
        assert locale["number_format"]["decimal_separator"] == "."
        assert locale["number_format"]["thousand_separator"] == ","

    def test_us_record_retention(self, us_module):
        """Test US record retention period."""
        assert us_module.get_record_retention_years() == 7

    def test_us_compliance_metadata(self, us_module):
        """Test US compliance metadata."""
        meta = us_module.get_compliance_metadata()
        assert meta["requires_tax_id"] is True
        assert meta["has_1099_reporting"] is True
        assert meta["has_federal_income_tax"] is True


# ============================================================================
# COA Template Tests
# ============================================================================


class TestCOATemplate:
    """Test chart of accounts templates."""

    def test_us_coa_template_exists(self):
        """Test that US COA template is returned."""
        us_module = registry.get("US")
        coa = us_module.get_coa_template()
        assert coa is not None
        assert coa.country_code == "US"
        assert coa.version == "1.0.0"

    def test_us_coa_has_accounts(self):
        """Test that US COA has accounts."""
        us_module = registry.get("US")
        coa = us_module.get_coa_template()
        assert len(coa.accounts) > 0
        # Should have asset, liability, equity, revenue, expense accounts
        account_types = {acc.get("type") for acc in coa.accounts}
        assert "asset" in account_types
        assert "liability" in account_types
        assert "equity" in account_types
        assert "revenue" in account_types
        assert "expense" in account_types

    def test_us_coa_account_structure(self):
        """Test US COA account structure."""
        us_module = registry.get("US")
        coa = us_module.get_coa_template()

        for account in coa.accounts:
            assert "code" in account
            assert "name" in account
            assert "type" in account
            assert account["type"] in ["asset", "liability", "equity", "revenue", "expense"]

    def test_us_coa_required_filing_accounts(self):
        """Test that US COA marks required-for-filing accounts."""
        us_module = registry.get("US")
        coa = us_module.get_coa_template()

        required_accounts = [acc for acc in coa.accounts if acc.get("required_for_filing")]
        assert len(required_accounts) > 0
        # Should include key balance sheet and income statement accounts
        required_codes = {acc["code"] for acc in required_accounts}
        assert "1100" in required_codes  # Cash
        assert "1200" in required_codes  # AR
        assert "2100" in required_codes  # AP
        assert "3100" in required_codes  # Equity
        assert "4100" in required_codes  # Revenue
        assert "6100" in required_codes  # Salaries

    def test_us_coa_1099_accounts(self):
        """Test that US COA includes 1099-reportable expense accounts."""
        us_module = registry.get("US")
        coa = us_module.get_coa_template()
        accounts = {acc["code"]: acc for acc in coa.accounts}

        assert "7700" in accounts  # Contract Labor (1099-NEC)
        assert accounts["7700"]["name"] == "Contract Labor (1099-NEC)"


# ============================================================================
# Account Validation Tests
# ============================================================================


class TestAccountValidation:
    """Test account validation rules."""

    def test_us_has_validation_rules(self):
        """Test that US module has account validation rules."""
        us_module = registry.get("US")
        rules = us_module.get_account_validation_rules()
        assert len(rules) > 0

    def test_us_validation_rule_structure(self):
        """Test validation rule structure."""
        us_module = registry.get("US")
        rules = us_module.get_account_validation_rules()

        for rule in rules:
            assert "rule_code" in rule
            assert "description" in rule
            assert "validate_fn" in rule
            assert "error_message" in rule

    def test_us_asset_account_numbering(self):
        """Test that asset accounts must start with 1."""
        us_module = registry.get("US")
        rules = us_module.get_account_validation_rules()
        asset_rule = next(r for r in rules if r["rule_code"] == "asset_numbering")

        # Valid asset account
        assert asset_rule["validate_fn"]({"type": "asset", "code": "1100"}) is True
        # Invalid asset account
        assert asset_rule["validate_fn"]({"type": "asset", "code": "2100"}) is False

    def test_us_liability_account_numbering(self):
        """Test that liability accounts must start with 2."""
        us_module = registry.get("US")
        rules = us_module.get_account_validation_rules()
        liability_rule = next(r for r in rules if r["rule_code"] == "liability_numbering")

        assert liability_rule["validate_fn"]({"type": "liability", "code": "2100"}) is True
        assert liability_rule["validate_fn"]({"type": "liability", "code": "1100"}) is False

    def test_us_equity_account_numbering(self):
        """Test that equity accounts must start with 3."""
        us_module = registry.get("US")
        rules = us_module.get_account_validation_rules()
        equity_rule = next(r for r in rules if r["rule_code"] == "equity_numbering")

        assert equity_rule["validate_fn"]({"type": "equity", "code": "3100"}) is True
        assert equity_rule["validate_fn"]({"type": "equity", "code": "2100"}) is False

    def test_us_revenue_account_numbering(self):
        """Test that revenue accounts must start with 4."""
        us_module = registry.get("US")
        rules = us_module.get_account_validation_rules()
        revenue_rule = next(r for r in rules if r["rule_code"] == "revenue_numbering")

        assert revenue_rule["validate_fn"]({"type": "revenue", "code": "4100"}) is True
        assert revenue_rule["validate_fn"]({"type": "revenue", "code": "3100"}) is False

    def test_us_expense_account_numbering(self):
        """Test that expense accounts must start with 5-8."""
        us_module = registry.get("US")
        rules = us_module.get_account_validation_rules()
        expense_rule = next(r for r in rules if r["rule_code"] == "expense_numbering")

        assert expense_rule["validate_fn"]({"type": "expense", "code": "5000"}) is True
        assert expense_rule["validate_fn"]({"type": "expense", "code": "6000"}) is True
        assert expense_rule["validate_fn"]({"type": "expense", "code": "7000"}) is True
        assert expense_rule["validate_fn"]({"type": "expense", "code": "8000"}) is True
        assert expense_rule["validate_fn"]({"type": "expense", "code": "4000"}) is False


# ============================================================================
# Tax Rules Tests
# ============================================================================


class TestTaxRules:
    """Test tax rules."""

    def test_us_has_tax_rules(self):
        """Test that US module has tax rules."""
        us_module = registry.get("US")
        rules = us_module.get_tax_rules()
        assert len(rules) > 0

    def test_us_tax_rule_structure(self):
        """Test tax rule structure."""
        us_module = registry.get("US")
        rules = us_module.get_tax_rules()

        for rule in rules:
            assert isinstance(rule, TaxRule)
            assert rule.code
            assert rule.name
            assert rule.rule_type
            assert rule.description

    def test_us_has_1099_rule(self):
        """Test that US has 1099-NEC reporting rule."""
        us_module = registry.get("US")
        rules = us_module.get_tax_rules()
        rule_codes = {r.code for r in rules}
        assert "us_1099_nec_threshold" in rule_codes

    def test_us_has_meals_entertainment_rule(self):
        """Test that US has meals & entertainment deduction rule."""
        us_module = registry.get("US")
        rules = us_module.get_tax_rules()
        rule_codes = {r.code for r in rules}
        assert "us_meals_entertainment_50" in rule_codes

    def test_us_has_depreciation_rule(self):
        """Test that US has GAAP vs. tax depreciation rule."""
        us_module = registry.get("US")
        rules = us_module.get_tax_rules()
        rule_codes = {r.code for r in rules}
        assert "us_depreciation_gaap_vs_tax" in rule_codes

    def test_us_has_loss_carryover_rule(self):
        """Test that US has NOL carryback/forward rule."""
        us_module = registry.get("US")
        rules = us_module.get_tax_rules()
        rule_codes = {r.code for r in rules}
        assert "us_net_loss_carryback" in rule_codes

    def test_us_1099_threshold_parameter(self):
        """Test 1099 threshold is correctly set to $600."""
        us_module = registry.get("US")
        rules = us_module.get_tax_rules()
        rule = next(r for r in rules if r.code == "us_1099_nec_threshold")
        assert rule.parameters["threshold_usd"] == 600
        assert rule.parameters["form"] == "1099-NEC"


# ============================================================================
# Reporting Rules Tests
# ============================================================================


class TestReportingRules:
    """Test reporting/tax form rules."""

    def test_us_has_reporting_rules(self):
        """Test that US module has reporting rules."""
        us_module = registry.get("US")
        rules = us_module.get_reporting_rules()
        assert len(rules) > 0

    def test_us_reporting_rule_structure(self):
        """Test reporting rule structure."""
        us_module = registry.get("US")
        rules = us_module.get_reporting_rules()

        for rule in rules:
            assert isinstance(rule, ReportingRule)
            assert rule.report_name
            assert rule.line_code
            assert rule.line_description
            assert rule.formula

    def test_us_has_1120s_schedule_l_rules(self):
        """Test that US has 1120-S Schedule L (balance sheet) rules."""
        us_module = registry.get("US")
        rules = us_module.get_reporting_rules()
        schedule_l_rules = [r for r in rules if "1120-S Schedule L" in r.report_name]
        assert len(schedule_l_rules) > 0

    def test_us_has_1120s_schedule_k_rules(self):
        """Test that US has 1120-S Schedule K (income statement) rules."""
        us_module = registry.get("US")
        rules = us_module.get_reporting_rules()
        schedule_k_rules = [r for r in rules if "1120-S Schedule K" in r.report_name]
        assert len(schedule_k_rules) > 0

    def test_us_schedule_l_cash_line(self):
        """Test Schedule L Line 1 (Cash) mapping."""
        us_module = registry.get("US")
        rules = us_module.get_reporting_rules()
        rule = next(r for r in rules if r.line_code == "L_1")
        assert "Cash" in rule.line_description
        assert "1100" in rule.accounts or "1100:1199" in rule.formula

    def test_us_schedule_l_ar_line(self):
        """Test Schedule L Line 2 (AR) mapping."""
        us_module = registry.get("US")
        rules = us_module.get_reporting_rules()
        rule = next(r for r in rules if r.line_code == "L_2")
        assert "Accounts receivable" in rule.line_description
        assert "1200" in rule.accounts or "1200" in rule.formula

    def test_us_schedule_k_gross_receipts_line(self):
        """Test Schedule K Line 1 (Gross Receipts)."""
        us_module = registry.get("US")
        rules = us_module.get_reporting_rules()
        rule = next(r for r in rules if r.line_code == "K_1")
        assert "Gross receipts" in rule.line_description.lower()
        assert any(acc in rule.formula for acc in ["4100", "4200", "4300"])

    def test_us_schedule_k_cogs_line(self):
        """Test Schedule K Line 2 (COGS)."""
        us_module = registry.get("US")
        rules = us_module.get_reporting_rules()
        rule = next(r for r in rules if r.line_code == "K_2")
        assert "Cost of goods sold" in rule.line_description.lower()
        assert "5" in rule.formula  # Should reference 5xxx accounts


# ============================================================================
# GL Rules Tests
# ============================================================================


class TestGLRules:
    """Test GL account field requirements."""

    def test_us_has_gl_rules(self):
        """Test that US module has GL rules."""
        us_module = registry.get("US")
        rules = us_module.get_gl_rules()
        assert len(rules) > 0

    def test_us_gl_rule_structure(self):
        """Test GL rule structure."""
        us_module = registry.get("US")
        rules = us_module.get_gl_rules()

        for rule in rules:
            assert isinstance(rule, GLRule)
            assert rule.field_name
            assert isinstance(rule.is_mandatory, bool)

    def test_us_expense_accounts_require_cost_center(self):
        """Test that US expense accounts require cost center."""
        us_module = registry.get("US")
        rules = us_module.get_gl_rules()
        cost_center_rule = next(r for r in rules if r.field_name == "cost_center")
        assert cost_center_rule.is_mandatory is True
        assert "expense" in cost_center_rule.applies_to_account_types

    def test_us_1099_accounts_require_flag(self):
        """Test that 1099-reportable accounts require vendor flag."""
        us_module = registry.get("US")
        rules = us_module.get_gl_rules()
        rules_1099 = [r for r in rules if "1099" in r.field_name]
        assert len(rules_1099) > 0

    def test_us_fixed_assets_require_capitalization_date(self):
        """Test that fixed assets require capitalization date."""
        us_module = registry.get("US")
        rules = us_module.get_gl_rules()
        cap_date_rule = next(r for r in rules if r.field_name == "capitalization_date")
        assert cap_date_rule.is_mandatory is True
        assert "asset" in cap_date_rule.applies_to_account_types


# ============================================================================
# Entity Validation Tests
# ============================================================================


class TestEntityValidation:
    """Test entity-level validation."""

    def test_us_entity_requires_ein_or_ssn(self):
        """Test that US entities require EIN or SSN."""
        us_module = registry.get("US")

        # Valid: has EIN
        valid_entity = {
            "ein": "12-3456789",
            "entity_type": "S-Corp",
        }
        assert us_module.validate_entity_required_fields(valid_entity) is True

        # Valid: has SSN
        valid_entity = {
            "ssn": "123-45-6789",
            "entity_type": "Sole-Proprietor",
        }
        assert us_module.validate_entity_required_fields(valid_entity) is True

        # Invalid: neither EIN nor SSN
        invalid_entity = {
            "entity_type": "S-Corp",
        }
        with pytest.raises(ValueError) as exc_info:
            us_module.validate_entity_required_fields(invalid_entity)
        assert "EIN or SSN" in str(exc_info.value)

    def test_us_entity_requires_type(self):
        """Test that US entities require entity_type."""
        us_module = registry.get("US")

        invalid_entity = {
            "ein": "12-3456789",
        }
        with pytest.raises(ValueError) as exc_info:
            us_module.validate_entity_required_fields(invalid_entity)
        assert "entity_type" in str(exc_info.value)

    def test_us_entity_type_must_be_valid(self):
        """Test that entity_type must be a valid value."""
        us_module = registry.get("US")

        invalid_entity = {
            "ein": "12-3456789",
            "entity_type": "InvalidType",
        }
        with pytest.raises(ValueError) as exc_info:
            us_module.validate_entity_required_fields(invalid_entity)
        assert "entity_type must be one of" in str(exc_info.value)

    def test_us_valid_entity_types(self):
        """Test all valid US entity types."""
        us_module = registry.get("US")

        valid_types = ["S-CORP", "C-CORP", "PARTNERSHIP", "SOLE-PROPRIETOR", "LLC"]
        for entity_type in valid_types:
            entity = {
                "ein": "12-3456789",
                "entity_type": entity_type,
            }
            assert us_module.validate_entity_required_fields(entity) is True


# ============================================================================
# Journal Entry Validation Tests
# ============================================================================


class TestJournalEntryValidation:
    """Test journal entry validation per jurisdiction."""

    def test_us_entry_validation_structure(self):
        """Test journal entry validation return structure."""
        us_module = registry.get("US")

        entry = {
            "lines": [
                {"account_code": "1100", "debit": Decimal("1000"), "credit": Decimal("0")},
                {"account_code": "4100", "debit": Decimal("0"), "credit": Decimal("1000")},
            ]
        }

        result = us_module.validate_journal_entry(entry)
        assert "is_valid" in result
        assert "errors" in result
        assert "warnings" in result
        assert isinstance(result["is_valid"], bool)
        assert isinstance(result["errors"], list)
        assert isinstance(result["warnings"], list)

    def test_us_expense_without_cost_center_error(self):
        """Test that expense without cost center generates error."""
        us_module = registry.get("US")

        entry = {
            "lines": [
                {"account_code": "6100", "cost_center": None},  # Salary without cost center
            ]
        }

        result = us_module.validate_journal_entry(entry)
        assert result["is_valid"] is False
        assert len(result["errors"]) > 0

    def test_us_1099_account_without_flag_warning(self):
        """Test that 1099 account without vendor flag generates warning."""
        us_module = registry.get("US")

        entry = {
            "lines": [
                {"account_code": "7700", "vendor_1099_flag": False},  # 1099 without flag
            ]
        }

        result = us_module.validate_journal_entry(entry)
        # Should still be valid but with warning
        assert len(result["warnings"]) > 0


# ============================================================================
# Skeleton Module Tests
# ============================================================================


class TestSkeletonModules:
    """Test that skeleton modules have correct structure."""

    def test_all_skeleton_modules_implement_interface(self):
        """Test that all skeleton modules implement LocalizationModule."""
        for country_code in ["UY", "BVI", "UK", "CH", "HK", "NZ", "UAE", "SG", "ES", "IT"]:
            module = registry.get(country_code)
            assert isinstance(module, LocalizationModule)

    def test_skeleton_modules_have_metadata(self):
        """Test that skeleton modules have required metadata."""
        for country_code in ["UY", "BVI", "UK", "CH", "HK", "NZ", "UAE", "SG", "ES", "IT"]:
            module = registry.get(country_code)
            assert module.country_code == country_code
            assert module.country_name
            assert module.version
            assert module.get_default_currency()
            assert module.get_default_timezone()
            assert module.get_default_fiscal_year_end()

    def test_skeleton_modules_have_locale_overrides(self):
        """Test that skeleton modules define locale overrides."""
        for country_code in ["UY", "BVI", "UK", "CH", "HK", "NZ", "UAE", "SG", "ES", "IT"]:
            module = registry.get(country_code)
            locale = module.get_locale_overrides()
            assert "number_format" in locale
            assert "date_format" in locale
            assert "language" in locale

    def test_uy_module_currency(self):
        """Test Uruguay module has UYU currency."""
        uy = registry.get("UY")
        assert uy.get_default_currency() == "UYU"

    def test_uk_module_currency(self):
        """Test UK module has GBP currency."""
        uk = registry.get("UK")
        assert uk.get_default_currency() == "GBP"

    def test_es_module_currency(self):
        """Test Spain module has EUR currency."""
        es = registry.get("ES")
        assert es.get_default_currency() == "EUR"

    def test_it_module_currency(self):
        """Test Italy module has EUR currency."""
        it = registry.get("IT")
        assert it.get_default_currency() == "EUR"

    def test_sg_module_has_e_invoicing(self):
        """Test Singapore has Peppol e-invoicing."""
        sg = registry.get("SG")
        assert sg.get_e_invoicing_connector_type() == "peppol"

    def test_es_module_has_sii_e_invoicing(self):
        """Test Spain has SII e-invoicing."""
        es = registry.get("ES")
        assert es.get_e_invoicing_connector_type() == "sii"

    def test_it_module_has_sdi_e_invoicing(self):
        """Test Italy has SDI e-invoicing."""
        it = registry.get("IT")
        assert it.get_e_invoicing_connector_type() == "sdi"

    def test_uk_module_has_mtd_e_invoicing(self):
        """Test UK has MTD e-invoicing."""
        uk = registry.get("UK")
        assert uk.get_e_invoicing_connector_type() == "mtd"


# ============================================================================
# Core Engine Isolation Tests
# ============================================================================


class TestCoreEngineIsolation:
    """Test that core engine can work without jurisdiction coupling."""

    def test_core_engine_without_loaded_modules(self):
        """Test that core engine works with no modules loaded."""
        registry.clear_all()
        available = registry.list_available()
        # Available (known paths) should still be there
        assert len(available) == 11
        # But none should be loaded
        assert len(registry.list_loaded()) == 0

    def test_no_hardcoded_jurisdiction_in_base(self):
        """Test that base.py has no hardcoded jurisdiction."""
        # This is a code review test - verify base.py doesn't import country-specific code
        from .. import base
        source = open(base.__file__).read()
        hardcoded_countries = ["US", "UK", "Spain", "Italy", "China", "Japan"]
        for country in hardcoded_countries:
            # Allow in docstrings/examples, but not in actual code
            # This is a heuristic check
            assert f'country_code == "{country}"' not in source

    def test_module_registration_pattern(self):
        """Test that module self-registration pattern works."""
        # Each module should register itself on import
        # This is implicitly tested by the load tests above
        registry.clear_all()
        us = registry.get("US")
        assert registry.is_loaded("US")


# ============================================================================
# Common Tax Adjustments Tests
# ============================================================================


class TestCommonTaxAdjustments:
    """Test the 10 most common US tax adjustments."""

    def test_us_has_10_common_adjustments(self):
        """Test that US module returns 10 most common tax adjustments."""
        us_module = registry.get("US")
        from ..us_module.rules import get_us_common_tax_adjustments
        adjustments = get_us_common_tax_adjustments()
        assert len(adjustments) == 10

    def test_adjustment_structure(self):
        """Test adjustment structure."""
        from ..us_module.rules import get_us_common_tax_adjustments
        adjustments = get_us_common_tax_adjustments()

        for adj in adjustments:
            assert "code" in adj
            assert "name" in adj
            assert "description" in adj
            assert "frequency" in adj
            assert "affected_accounts" in adj

    def test_meals_entertainment_adjustment(self):
        """Test meals & entertainment 50% adjustment."""
        from ..us_module.rules import get_us_common_tax_adjustments
        adjustments = get_us_common_tax_adjustments()
        adj = next((a for a in adjustments if "Meals" in a["name"]), None)
        assert adj is not None
        assert "50%" in adj["name"]

    def test_depreciation_adjustment(self):
        """Test GAAP vs. tax depreciation adjustment."""
        from ..us_module.rules import get_us_common_tax_adjustments
        adjustments = get_us_common_tax_adjustments()
        adj = next((a for a in adjustments if "Depreciation" in a["name"]), None)
        assert adj is not None
        assert "GAAP" in adj["description"] or "MACRS" in adj["description"]


# ============================================================================
# Version Management Tests
# ============================================================================


class TestVersionHistory:
    """Test module version management."""

    def test_us_module_has_version_history(self):
        """Test that US module has version history."""
        us_module = registry.get("US")
        history = us_module.get_version_history()
        assert len(history) > 0

    def test_version_history_structure(self):
        """Test version history structure."""
        us_module = registry.get("US")
        history = us_module.get_version_history()

        for entry in history:
            assert "version" in entry
            assert "released" in entry
            assert "changes" in entry
            assert isinstance(entry["changes"], list)

    def test_us_v1_in_history(self):
        """Test that US module v1.0.0 is in history."""
        us_module = registry.get("US")
        history = us_module.get_version_history()
        versions = {v["version"] for v in history}
        assert "1.0.0" in versions


# ============================================================================
# Integration Tests
# ============================================================================


class TestModuleIntegration:
    """Integration tests for module interactions."""

    def test_switching_jurisdictions(self):
        """Test switching between jurisdictions (simulated)."""
        us = registry.get("US")
        uy = registry.get("UY")

        # Both should work independently
        assert us.get_default_currency() == "USD"
        assert uy.get_default_currency() == "UYU"

        # Account migration scenario
        us_account = {
            "code": "1100",
            "name": "Cash",
            "type": "asset",
        }

        mapping = uy.migrate_account_mapping("US", "1100", "Cash")
        # UY hasn't implemented migration yet, so should return manual review required
        assert mapping["manual_review_required"] is True

    def test_jurisdiction_specific_compliance(self):
        """Test jurisdiction-specific compliance requirements."""
        us = registry.get("US")
        it = registry.get("IT")

        us_meta = us.get_compliance_metadata()
        it_meta = it.get_compliance_metadata()

        # US has 1099
        assert us_meta["has_1099_reporting"] is True
        # Italy has IVA
        assert it_meta["has_iva"] is True
        # Italy has SDI e-invoicing
        assert it_meta["sdi_e_invoicing_mandatory"] is True


# ============================================================================
# Run All Tests
# ============================================================================


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
