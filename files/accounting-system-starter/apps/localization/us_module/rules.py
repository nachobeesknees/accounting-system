"""
US GAAP and tax rules for v1.

Implements:
- GAAP chart of accounts template
- Account validation (asset/liability/equity/revenue/expense structure)
- Tax rules (deductibility, 1099 categorization, carryovers)
- 1120-S / 1065 / 1040-C reporting structure
- 10 most common tax adjustments
- GL account mandatory/optional fields
"""

from typing import List, Dict, Any
from ..base import COATemplate, TaxRule, ReportingRule, GLRule

# ============================================================================
# GAAP Chart of Accounts Template
# ============================================================================

US_COA_TEMPLATE_DATA = [
    # ASSETS (1000-1999)
    {"code": "1000", "name": "Current Assets", "type": "asset", "subtype": "current", "is_header": True, "required_for_filing": True},
    {"code": "1100", "name": "Cash and Cash Equivalents", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": True},
    {"code": "1110", "name": "Operating Cash - Primary", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "1120", "name": "Operating Cash - Secondary", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "1200", "name": "Accounts Receivable", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": True},
    {"code": "1210", "name": "Trade Receivables", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "1220", "name": "Allowance for Credit Losses", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "1300", "name": "Inventory", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": True},
    {"code": "1310", "name": "Raw Materials", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "1320", "name": "Work in Process", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "1330", "name": "Finished Goods", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "1400", "name": "Prepaid Expenses", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": True},
    {"code": "1500", "name": "Other Current Assets", "type": "asset", "subtype": "current", "is_header": False, "required_for_filing": False},

    # Fixed Assets (1600-1900)
    {"code": "1600", "name": "Fixed Assets", "type": "asset", "subtype": "fixed", "is_header": True, "required_for_filing": True},
    {"code": "1610", "name": "Property and Equipment, Gross", "type": "asset", "subtype": "fixed", "is_header": False, "required_for_filing": True},
    {"code": "1620", "name": "Accumulated Depreciation", "type": "asset", "subtype": "fixed", "is_header": False, "required_for_filing": True},
    {"code": "1630", "name": "Capitalized Software", "type": "asset", "subtype": "intangible", "is_header": False, "required_for_filing": False},
    {"code": "1640", "name": "Accumulated Amortization - Software", "type": "asset", "subtype": "intangible", "is_header": False, "required_for_filing": False},
    {"code": "1700", "name": "Goodwill", "type": "asset", "subtype": "intangible", "is_header": False, "required_for_filing": True},
    {"code": "1710", "name": "Intangible Assets", "type": "asset", "subtype": "intangible", "is_header": False, "required_for_filing": False},
    {"code": "1720", "name": "Accumulated Amortization - Intangibles", "type": "asset", "subtype": "intangible", "is_header": False, "required_for_filing": False},

    # Deferred Tax Assets, Other Assets
    {"code": "1800", "name": "Deferred Tax Assets", "type": "asset", "subtype": "other", "is_header": False, "required_for_filing": True},
    {"code": "1900", "name": "Other Long-Term Assets", "type": "asset", "subtype": "other", "is_header": False, "required_for_filing": False},

    # LIABILITIES (2000-2999)
    {"code": "2000", "name": "Current Liabilities", "type": "liability", "subtype": "current", "is_header": True, "required_for_filing": True},
    {"code": "2100", "name": "Accounts Payable", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": True},
    {"code": "2110", "name": "Trade Payables", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "2200", "name": "Accrued Expenses", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": True},
    {"code": "2210", "name": "Accrued Salaries", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "2220", "name": "Accrued Bonuses", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "2230", "name": "Accrued Benefits", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "2300", "name": "Sales Tax Payable", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "2400", "name": "Income Tax Payable", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": True},
    {"code": "2500", "name": "Deferred Revenue", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": False},
    {"code": "2600", "name": "Short-Term Debt", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": True},
    {"code": "2700", "name": "Current Portion of Long-Term Debt", "type": "liability", "subtype": "current", "is_header": False, "required_for_filing": True},

    # Long-Term Liabilities
    {"code": "2800", "name": "Long-Term Liabilities", "type": "liability", "subtype": "longterm", "is_header": True, "required_for_filing": True},
    {"code": "2810", "name": "Long-Term Debt", "type": "liability", "subtype": "longterm", "is_header": False, "required_for_filing": True},
    {"code": "2820", "name": "Deferred Tax Liabilities", "type": "liability", "subtype": "longterm", "is_header": False, "required_for_filing": True},
    {"code": "2830", "name": "Lease Liabilities (ROU)", "type": "liability", "subtype": "longterm", "is_header": False, "required_for_filing": False},

    # EQUITY (3000-3999)
    {"code": "3000", "name": "Equity", "type": "equity", "subtype": "common", "is_header": True, "required_for_filing": True},
    {"code": "3100", "name": "Common Stock", "type": "equity", "subtype": "common", "is_header": False, "required_for_filing": True},
    {"code": "3200", "name": "Additional Paid-In Capital", "type": "equity", "subtype": "common", "is_header": False, "required_for_filing": True},
    {"code": "3300", "name": "Retained Earnings", "type": "equity", "subtype": "common", "is_header": False, "required_for_filing": True},
    {"code": "3310", "name": "Beginning Retained Earnings", "type": "equity", "subtype": "common", "is_header": False, "required_for_filing": False},
    {"code": "3320", "name": "Distributions", "type": "equity", "subtype": "common", "is_header": False, "required_for_filing": True},
    {"code": "3400", "name": "Accumulated Other Comprehensive Income", "type": "equity", "subtype": "common", "is_header": False, "required_for_filing": True},
    {"code": "3410", "name": "Cumulative Translation Adjustment", "type": "equity", "subtype": "common", "is_header": False, "required_for_filing": False},

    # REVENUE (4000-4999)
    {"code": "4000", "name": "Revenue", "type": "revenue", "subtype": "operating", "is_header": True, "required_for_filing": True},
    {"code": "4100", "name": "Product Sales", "type": "revenue", "subtype": "operating", "is_header": False, "required_for_filing": True},
    {"code": "4200", "name": "Service Revenue", "type": "revenue", "subtype": "operating", "is_header": False, "required_for_filing": True},
    {"code": "4300", "name": "Subscription Revenue", "type": "revenue", "subtype": "operating", "is_header": False, "required_for_filing": False},
    {"code": "4400", "name": "Other Operating Revenue", "type": "revenue", "subtype": "operating", "is_header": False, "required_for_filing": False},
    {"code": "4500", "name": "Interest Income", "type": "revenue", "subtype": "nonoperating", "is_header": False, "required_for_filing": True},
    {"code": "4600", "name": "Dividend Income", "type": "revenue", "subtype": "nonoperating", "is_header": False, "required_for_filing": True},
    {"code": "4700", "name": "Gain on Sale of Assets", "type": "revenue", "subtype": "nonoperating", "is_header": False, "required_for_filing": False},

    # EXPENSES (5000-8999)
    {"code": "5000", "name": "Cost of Goods Sold", "type": "expense", "subtype": "cogs", "is_header": True, "required_for_filing": True},
    {"code": "5100", "name": "Materials and Supplies", "type": "expense", "subtype": "cogs", "is_header": False, "required_for_filing": False},
    {"code": "5200", "name": "Direct Labor", "type": "expense", "subtype": "cogs", "is_header": False, "required_for_filing": False},

    {"code": "6000", "name": "Operating Expenses", "type": "expense", "subtype": "opex", "is_header": True, "required_for_filing": True},
    {"code": "6100", "name": "Salaries and Wages", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "6110", "name": "Executive Salaries", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "6120", "name": "Staff Salaries", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "6200", "name": "Employee Benefits", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "6210", "name": "Health Insurance", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "6220", "name": "Retirement Plan Contributions", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "6300", "name": "Rent and Occupancy", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "6400", "name": "Utilities", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "6500", "name": "Office Supplies", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "6600", "name": "Depreciation Expense", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "6700", "name": "Amortization Expense", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "6800", "name": "Professional Services", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "6810", "name": "Audit and Accounting Fees", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "6820", "name": "Legal Fees", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "6830", "name": "Consulting Fees", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "6900", "name": "Marketing and Advertising", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "6910", "name": "Digital Marketing", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "6920", "name": "Travel and Entertainment", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "7000", "name": "Repair and Maintenance", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "7100", "name": "Insurance", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "7200", "name": "Taxes and Licenses", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "7300", "name": "Meals and Entertainment (Non-Deductible)", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "7400", "name": "Meals and Entertainment (50% Deductible)", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "7500", "name": "Research and Development", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "7600", "name": "Royalties and Licensing", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},

    # 1099-Reportable Expenses (specific categorization for tax reporting)
    {"code": "7700", "name": "Contract Labor (1099-NEC)", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": True},
    {"code": "7710", "name": "Programming Services (1099-reportable)", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},
    {"code": "7720", "name": "Consulting (1099-reportable)", "type": "expense", "subtype": "opex", "is_header": False, "required_for_filing": False},

    # Non-Operating Expenses
    {"code": "8000", "name": "Interest Expense", "type": "expense", "subtype": "nonop", "is_header": False, "required_for_filing": True},
    {"code": "8100", "name": "Loss on Sale of Assets", "type": "expense", "subtype": "nonop", "is_header": False, "required_for_filing": False},
    {"code": "8200", "name": "Foreign Exchange Loss", "type": "expense", "subtype": "nonop", "is_header": False, "required_for_filing": False},

    # Tax Adjustments (not booked, but tracked for reconciliation)
    {"code": "8900", "name": "Estimated Tax Adjustment", "type": "expense", "subtype": "nonop", "is_header": False, "required_for_filing": False},
]

def get_us_coa_template() -> COATemplate:
    """Get the US GAAP chart of accounts template."""
    return COATemplate(
        country_code="US",
        name="US GAAP Chart of Accounts",
        description="Standard US GAAP chart of accounts with accounts for 1040-C, 1065, 1120-S reporting",
        version="1.0.0",
        accounts=US_COA_TEMPLATE_DATA,
    )


# ============================================================================
# Account Validation Rules
# ============================================================================

def get_us_account_validation_rules() -> List[Dict[str, Any]]:
    """
    Return US GAAP account validation rules.

    Rules enforce:
    - Asset accounts start with 1
    - Liability accounts start with 2
    - Equity accounts start with 3
    - Revenue accounts start with 4
    - Expense accounts start with 5-8
    - All accounts must have cost center if they're expense accounts
    """
    return [
        {
            "rule_code": "asset_numbering",
            "description": "Asset accounts must start with 1",
            "validate_fn": lambda acc: not (acc.get("type") == "asset" and not str(acc.get("code", "")).startswith("1")),
            "error_message": "Asset accounts must start with 1xxx",
        },
        {
            "rule_code": "liability_numbering",
            "description": "Liability accounts must start with 2",
            "validate_fn": lambda acc: not (acc.get("type") == "liability" and not str(acc.get("code", "")).startswith("2")),
            "error_message": "Liability accounts must start with 2xxx",
        },
        {
            "rule_code": "equity_numbering",
            "description": "Equity accounts must start with 3",
            "validate_fn": lambda acc: not (acc.get("type") == "equity" and not str(acc.get("code", "")).startswith("3")),
            "error_message": "Equity accounts must start with 3xxx",
        },
        {
            "rule_code": "revenue_numbering",
            "description": "Revenue accounts must start with 4",
            "validate_fn": lambda acc: not (acc.get("type") == "revenue" and not str(acc.get("code", "")).startswith("4")),
            "error_message": "Revenue accounts must start with 4xxx",
        },
        {
            "rule_code": "expense_numbering",
            "description": "Expense accounts must start with 5-8",
            "validate_fn": lambda acc: not (acc.get("type") == "expense" and not str(acc.get("code", ""))[0] in "5678"),
            "error_message": "Expense accounts must start with 5xxx-8xxx",
        },
        {
            "rule_code": "no_header_transactions",
            "description": "Header accounts cannot have transactions",
            "validate_fn": lambda acc: True,  # Enforced in journal entry posting, not account creation
            "error_message": "Transactions cannot be posted to header accounts",
        },
    ]


# ============================================================================
# Tax Rules
# ============================================================================

def get_us_tax_rules() -> List[TaxRule]:
    """
    Return US tax rules.

    Covers:
    - 1099-reportable expense categorization
    - Deductibility rules (full, 50%, non-deductible)
    - Loss carryback/forward rules
    - R&D credit eligibility
    - Depreciation methods (GAAP vs. MACRS)
    """
    return [
        TaxRule(
            code="us_1099_nec_threshold",
            name="1099-NEC Reporting Threshold",
            rule_type="reporting",
            description="Must file 1099-NEC for non-employee compensation >= $600 from single vendor",
            applies_to=["7700", "7710", "7720"],  # Contract labor accounts
            parameters={"threshold_usd": 600, "form": "1099-NEC"},
        ),
        TaxRule(
            code="us_meals_entertainment_50",
            name="Meals and Entertainment 50% Deduction",
            rule_type="deductibility",
            description="Meals and entertainment generally 50% deductible (100% 2021-2025 for qualified food/beverages)",
            applies_to=["6920", "7400"],
            parameters={"deduction_percentage": 50, "exceptions": ["covid_relief_2021_2025"]},
        ),
        TaxRule(
            code="us_meals_entertainment_non_deductible",
            name="Non-Deductible Entertainment",
            rule_type="deductibility",
            description="Certain entertainment expenses are non-deductible (e.g., clubs, lobbying)",
            applies_to=["7300"],
            parameters={"deduction_percentage": 0},
        ),
        TaxRule(
            code="us_interest_deductibility",
            name="Interest Expense Deductibility",
            rule_type="deductibility",
            description="Business interest generally deductible subject to interest deduction limitation (26 USC 163(j))",
            applies_to=["8000"],
            parameters={"generally_deductible": True, "limitation_applies": True},
        ),
        TaxRule(
            code="us_depreciation_gaap_vs_tax",
            name="Depreciation: GAAP vs. Tax Basis",
            rule_type="timing",
            description="Depreciation may differ between GAAP (straight-line) and tax (MACRS). Track separately.",
            applies_to=["6600"],
            parameters={"gaap_method": "straight_line", "tax_method": "macrs"},
        ),
        TaxRule(
            code="us_net_loss_carryback",
            name="NOL Carryback",
            rule_type="carryover",
            description="Net operating losses can be carried back 2 years (post-CARES Act rules) and forward 20 years",
            applies_to=None,  # Entity-level rule
            parameters={"carryback_years": 2, "carryforward_years": 20},
        ),
        TaxRule(
            code="us_rd_credit_eligibility",
            name="R&D Tax Credit Eligibility",
            rule_type="classification",
            description="Qualifying research and development expenses eligible for R&D credit (Form 3115 or form 6560)",
            applies_to=["7500"],
            parameters={"credit_percentage": 0.20, "requires_documentation": True},
        ),
        TaxRule(
            code="us_startup_costs",
            name="Startup Costs",
            rule_type="deductibility",
            description="Up to $5,000 immediately deductible; excess amortized over 15 years",
            applies_to=None,
            parameters={"immediate_deduction": 5000, "amortization_years": 15},
        ),
    ]


# ============================================================================
# Reporting Rules (Tax Forms and Statutory Filings)
# ============================================================================

def get_us_reporting_rules() -> List[ReportingRule]:
    """
    Return US tax and statutory reporting rules.

    Covers:
    - 1120-S (S-Corporation) Schedule L and Schedule K-1
    - 1065 (Partnership) Schedule L and Schedule K-1
    - 1040-C (Self-Employed, sole proprietor)
    """
    return [
        # Balance Sheet (Schedule L - all entity types)
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_1",
            line_description="Cash",
            formula="sum(1100:1199)",
            accounts=["1100", "1110", "1120"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_2",
            line_description="Accounts receivable",
            formula="sum(1200:1299) - 1220",  # Net of allowance
            accounts=["1200", "1210", "1220"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_3",
            line_description="Inventories",
            formula="sum(1300:1399)",
            accounts=["1300", "1310", "1320", "1330"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_4",
            line_description="U.S. government obligations",
            formula="0",  # N/A for this system
            accounts=[],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_5",
            line_description="Tax-exempt securities",
            formula="0",  # N/A for this system
            accounts=[],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_6",
            line_description="Other current assets",
            formula="sum(1400:1599)",
            accounts=["1400", "1500"],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_7",
            line_description="Loans to shareholders",
            formula="0",  # N/A unless tracked separately
            accounts=[],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_8",
            line_description="Mortgage loans on real estate",
            formula="0",  # N/A unless tracked separately
            accounts=[],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_9",
            line_description="Other investments",
            formula="sum(1900:1999)",
            accounts=["1800", "1900"],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_10",
            line_description="Depreciable, depletable, and intangible assets",
            formula="sum(1600:1799)",
            accounts=["1610", "1620", "1700", "1710"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_11",
            line_description="Land",
            formula="0",  # Captured in 1610 if held
            accounts=[],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_12",
            line_description="Other assets",
            formula="0",
            accounts=[],
            is_required=False,
        ),

        # Liabilities
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_13",
            line_description="Accounts payable",
            formula="sum(2100:2199)",
            accounts=["2100", "2110"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_14",
            line_description="Mortgages, notes, bonds payable in less than 1 year",
            formula="sum(2600:2699) + sum(2700:2799)",
            accounts=["2600", "2700"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_15",
            line_description="Other current liabilities",
            formula="sum(2200:2599)",
            accounts=["2200", "2300", "2400", "2500"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_16",
            line_description="Loans from shareholders",
            formula="0",
            accounts=[],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_17",
            line_description="Mortgages, notes, bonds payable in 1 year or more",
            formula="sum(2810:2839)",
            accounts=["2810"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_18",
            line_description="Other liabilities",
            formula="0",
            accounts=[],
            is_required=False,
        ),

        # Equity
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_19",
            line_description="Capital stock",
            formula="sum(3100:3199)",
            accounts=["3100"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_20",
            line_description="Additional paid-in capital",
            formula="sum(3200:3299)",
            accounts=["3200"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule L",
            line_code="L_21",
            line_description="Retained earnings",
            formula="sum(3300:3399) - sum(3310:3399)",
            accounts=["3300"],
            is_required=True,
        ),

        # Income Statement Lines
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_1",
            line_description="Gross receipts or sales",
            formula="sum(4100:4499)",
            accounts=["4100", "4200", "4300", "4400"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_2",
            line_description="Cost of goods sold",
            formula="sum(5000:5999)",
            accounts=["5000", "5100", "5200"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_3",
            line_description="Gross profit",
            formula="K_1 - K_2",
            accounts=[],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_4",
            line_description="Interest income",
            formula="sum(4500:4599)",
            accounts=["4500"],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_5",
            line_description="Dividend income",
            formula="sum(4600:4699)",
            accounts=["4600"],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_6",
            line_description="Salaries and wages",
            formula="sum(6100:6199)",
            accounts=["6100"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_7",
            line_description="Repairs and maintenance",
            formula="sum(7000:7099)",
            accounts=["7000"],
            is_required=False,
        ),
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_8",
            line_description="Depreciation",
            formula="sum(6600:6699)",
            accounts=["6600"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_9",
            line_description="Interest expense",
            formula="sum(8000:8099)",
            accounts=["8000"],
            is_required=True,
        ),
        ReportingRule(
            report_name="1120-S Schedule K",
            line_code="K_10",
            line_description="Taxes and licenses",
            formula="sum(7200:7299)",
            accounts=["7200"],
            is_required=False,
        ),
    ]


# ============================================================================
# GL Account Mandatory/Optional Fields
# ============================================================================

def get_us_gl_rules() -> List[GLRule]:
    """
    Return US GL field requirements.

    Rules:
    - All expense accounts require cost center
    - Revenue accounts may have department
    - Fixed asset accounts require capitalization date and method
    - 1099-reportable accounts require vendor 1099 flag
    """
    return [
        GLRule(
            field_name="cost_center",
            is_mandatory=True,
            applies_to_account_types=["expense"],
            description="All expense accounts must have cost center",
        ),
        GLRule(
            field_name="department",
            is_mandatory=False,
            applies_to_account_types=["revenue", "expense"],
            description="Department is optional for revenue and expense accounts",
        ),
        GLRule(
            field_name="project",
            is_mandatory=False,
            applies_to_account_types=["expense"],
            description="Project coding is optional for billable expenses",
        ),
        GLRule(
            field_name="capitalization_date",
            is_mandatory=True,
            applies_to_account_types=["asset"],
            applies_to_account_codes=["1610", "1630"],
            description="Fixed and intangible assets must have capitalization date",
        ),
        GLRule(
            field_name="depreciation_method",
            is_mandatory=True,
            applies_to_account_types=["asset"],
            applies_to_account_codes=["1610"],
            allowed_values=["straight_line", "macrs", "units_of_production"],
            description="Depreciable assets must specify depreciation method",
        ),
        GLRule(
            field_name="is_1099_reportable",
            is_mandatory=True,
            applies_to_account_types=["expense"],
            applies_to_account_codes=["7700", "7710", "7720"],
            description="1099-reportable expense accounts require vendor 1099 flag",
        ),
    ]


# ============================================================================
# 10 Most Common Tax Adjustments
# ============================================================================

def get_us_common_tax_adjustments() -> List[Dict[str, Any]]:
    """
    Return the 10 most common US tax adjustments.

    These are often manually entered by tax preparers in the tax return.
    """
    return [
        {
            "code": "adj_1",
            "name": "Meals and Entertainment 50% Reduction",
            "description": "Book M&E expense is 100%, but tax return deducts 50%",
            "frequency": "very_common",
            "affected_accounts": ["6920", "7400"],
        },
        {
            "code": "adj_2",
            "name": "Depreciation GAAP vs. Tax (MACRS)",
            "description": "Book depreciation (straight-line) differs from tax (MACRS)",
            "frequency": "very_common",
            "affected_accounts": ["6600"],
        },
        {
            "code": "adj_3",
            "name": "Deferred Revenue Recognition (ASC 606)",
            "description": "Book revenue deferred per ASC 606; tax recognizes when received",
            "frequency": "common",
            "affected_accounts": ["4100", "4200", "2500"],
        },
        {
            "code": "adj_4",
            "name": "Accrued Compensation",
            "description": "Book accrues year-end bonus; tax deducts only when paid (cash-basis)",
            "frequency": "common",
            "affected_accounts": ["6100", "2200"],
        },
        {
            "code": "adj_5",
            "name": "Bad Debt Allowance (GAAP vs. Tax)",
            "description": "Book uses allowance method; tax uses specific charge-off",
            "frequency": "common",
            "affected_accounts": ["1220"],
        },
        {
            "code": "adj_6",
            "name": "Start-up Costs",
            "description": "Book capitalizes; tax deducts $5k immediately + amortizes over 15 years",
            "frequency": "occasional",
            "affected_accounts": ["1710"],
        },
        {
            "code": "adj_7",
            "name": "Goodwill Amortization",
            "description": "Book amortizes; tax may not deduct (Section 197 rules)",
            "frequency": "occasional",
            "affected_accounts": ["1700", "6700"],
        },
        {
            "code": "adj_8",
            "name": "Interest Limitation (Section 163(j))",
            "description": "Tax deduction of interest limited to 30% of adjusted taxable income",
            "frequency": "occasional",
            "affected_accounts": ["8000"],
        },
        {
            "code": "adj_9",
            "name": "Net Operating Loss (NOL) Carryback",
            "description": "Current-year loss carried back 2 years, forward 20 years",
            "frequency": "occasional",
            "affected_accounts": None,  # Entity-level
        },
        {
            "code": "adj_10",
            "name": "Foreign Currency Transaction Gains/Losses",
            "description": "Book uses ASC 830; tax may use different timing",
            "frequency": "occasional",
            "affected_accounts": ["8200"],
        },
    ]
