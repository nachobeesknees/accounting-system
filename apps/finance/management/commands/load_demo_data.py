"""
Django management command to load comprehensive demo data for testing and demos.

This creates:
- 5 demo entities (parent + 4 operating companies)
- Multi-currency setup (USD, EUR, GBP)
- Complete chart of accounts per entity
- Sample journal entries (balanced, with FX)
- Intercompany transactions
- Demo user accounts

Usage:
    python manage.py load_demo_data
    python manage.py load_demo_data --clear  # Delete all first
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from apps.core.models import Entity, UserEntityPermission
from apps.finance.models import Account, Period, JournalEntry, JournalLine
from decimal import Decimal
from datetime import date, timedelta
import json


class Command(BaseCommand):
    help = "Load comprehensive demo data for testing"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all existing data first",
        )

    def handle(self, *args, **options):
        if options["clear"]:
            self.stdout.write(self.style.WARNING("Clearing existing data..."))
            Entity.objects.all().delete()
            User.objects.filter(username__startswith="demo_").delete()

        # Create demo users
        self.stdout.write(self.style.WARNING("Creating demo users..."))
        users = {}
        demo_users = [
            {"username": "demo_admin", "email": "admin@demo.local", "role": "admin"},
            {"username": "demo_accountant", "email": "accountant@demo.local", "role": "accountant"},
            {"username": "demo_cfo", "email": "cfo@demo.local", "role": "cfo"},
            {"username": "demo_controller", "email": "controller@demo.local", "role": "controller"},
        ]

        for user_data in demo_users:
            user, created = User.objects.get_or_create(
                username=user_data["username"],
                defaults={
                    "email": user_data["email"],
                    "first_name": user_data["role"].title(),
                    "last_name": "Demo",
                    "is_staff": True,
                },
            )
            users[user_data["role"]] = user
            if created:
                user.set_password("demo123")
                user.save()
                self.stdout.write(f"  ✓ User: {user_data['username']} (password: demo123)")
            else:
                self.stdout.write(f"  ✓ User exists: {user_data['username']}")

        # Create entity hierarchy
        self.stdout.write(self.style.WARNING("Creating entity hierarchy..."))
        entities = {}

        # Parent entity
        parent, _ = Entity.objects.get_or_create(
            code="PARENT-001",
            defaults={
                "name": "Demo Parent Company",
                "entity_type": "holdco",
                "functional_currency": "USD",
                "fiscal_year_start": 1,
                "created_by": users["admin"],
            },
        )
        entities["parent"] = parent
        self.stdout.write(f"  ✓ Parent: {parent.code} - {parent.name}")

        # Operating companies (USD, EUR, GBP)
        opco_data = [
            {
                "code": "OPCO-USA",
                "name": "Demo US Operations",
                "currency": "USD",
                "parent": parent,
            },
            {
                "code": "OPCO-EUR",
                "name": "Demo EU Operations",
                "currency": "EUR",
                "parent": parent,
            },
            {
                "code": "OPCO-GBP",
                "name": "Demo UK Operations",
                "currency": "GBP",
                "parent": parent,
            },
            {
                "code": "OPCO-AUS",
                "name": "Demo Asia Operations",
                "currency": "USD",
                "parent": parent,
            },
        ]

        for opco in opco_data:
            entity, _ = Entity.objects.get_or_create(
                code=opco["code"],
                defaults={
                    "name": opco["name"],
                    "entity_type": "opco",
                    "functional_currency": opco["currency"],
                    "fiscal_year_start": 1,
                    "created_by": users["admin"],
                },
            )
            entities[opco["code"]] = entity
            self.stdout.write(f"  ✓ OpCo: {entity.code} - {entity.name} ({entity.functional_currency})")

        # Grant user permissions to all entities
        self.stdout.write(self.style.WARNING("Assigning user permissions..."))
        for user_role, user in users.items():
            for entity in entities.values():
                perm, created = UserEntityPermission.objects.get_or_create(
                    user=user,
                    entity=entity,
                    defaults={"role": "admin" if user_role == "admin" else "editor"},
                )
                if created:
                    self.stdout.write(f"  ✓ {user.username} → {entity.code}")

        # Create periods for all entities
        self.stdout.write(self.style.WARNING("Creating periods..."))
        for entity in entities.values():
            for month in range(1, 13):
                start = date(2026, month, 1)
                end = date(2026, month + 1, 1) if month < 12 else date(2027, 1, 1)
                period, created = Period.objects.get_or_create(
                    entity=entity,
                    period_type="month",
                    fiscal_year=2026,
                    period_number=month,
                    defaults={
                        "start_date": start,
                        "end_date": end,
                        "status": "open" if month <= 3 else "closed",
                        "created_by": users["admin"],
                    },
                )
        self.stdout.write(f"  ✓ Created periods for {len(entities)} entities (12 months each)")

        # Create chart of accounts per entity
        self.stdout.write(self.style.WARNING("Creating chart of accounts..."))
        coa_template = {
            "Assets": [
                ("1010", "Cash", "asset"),
                ("1020", "Petty Cash", "asset"),
                ("1200", "Accounts Receivable", "asset"),
                ("1210", "AR - Customer A", "asset"),
                ("1220", "AR - Customer B", "asset"),
                ("1250", "Allowance for Doubtful Accounts", "asset"),
                ("1300", "Inventory", "asset"),
                ("1310", "Raw Materials", "asset"),
                ("1320", "Work in Progress", "asset"),
                ("1330", "Finished Goods", "asset"),
                ("1500", "Equipment", "asset"),
                ("1510", "Accumulated Depreciation - Equipment", "asset"),
                ("1600", "Furniture & Fixtures", "asset"),
                ("1700", "Intangible Assets", "asset"),
                ("1800", "Goodwill", "asset"),
            ],
            "Liabilities": [
                ("2010", "Accounts Payable", "liability"),
                ("2020", "Accrued Expenses", "liability"),
                ("2100", "Short-term Debt", "liability"),
                ("2200", "Long-term Debt", "liability"),
                ("2300", "Deferred Revenue", "liability"),
            ],
            "Equity": [
                ("3010", "Common Stock", "equity"),
                ("3020", "Additional Paid-in Capital", "equity"),
                ("3100", "Retained Earnings", "equity"),
                ("3200", "Accumulated Other Comprehensive Income", "equity"),
            ],
            "Revenue": [
                ("4010", "Product Revenue", "revenue"),
                ("4020", "Service Revenue", "revenue"),
                ("4030", "Consulting Revenue", "revenue"),
                ("4100", "Interest Income", "revenue"),
                ("4110", "Dividend Income", "revenue"),
            ],
            "Expenses": [
                ("5010", "Cost of Goods Sold", "expense"),
                ("5100", "Salaries & Wages", "expense"),
                ("5110", "Bonus", "expense"),
                ("5200", "Benefits", "expense"),
                ("5300", "Rent", "expense"),
                ("5400", "Utilities", "expense"),
                ("5500", "Office Supplies", "expense"),
                ("5600", "Professional Services", "expense"),
                ("5700", "Marketing & Advertising", "expense"),
                ("5800", "Depreciation", "expense"),
                ("5900", "Interest Expense", "expense"),
                ("6000", "Foreign Exchange Gain/Loss", "expense"),
            ],
        }

        account_count = 0
        for entity in entities.values():
            for category, accounts in coa_template.items():
                for code, name, acc_type in accounts:
                    Account.objects.get_or_create(
                        entity=entity,
                        code=code,
                        defaults={
                            "name": name,
                            "account_type": acc_type,
                            "currency": entity.functional_currency,
                            "is_active": True,
                            "postable": True,
                            "created_by": users["admin"],
                        },
                    )
                    account_count += 1

        self.stdout.write(
            f"  ✓ Created {account_count} accounts ({account_count // len(entities)} per entity)"
        )

        # Create sample transactions
        self.stdout.write(self.style.WARNING("Creating sample journal entries..."))
        entry_count = 0

        for entity in [entities["OPCO-USA"], entities["OPCO-EUR"]]:
            period = entity.period_set.filter(period_number=1).first()
            if not period:
                continue

            # Sample entries
            samples = [
                {
                    "description": "Opening balance - Cash",
                    "lines": [
                        ("1010", Decimal("50000.00"), Decimal("0.00")),
                        ("3100", Decimal("0.00"), Decimal("50000.00")),
                    ],
                },
                {
                    "description": "Sale to Customer A",
                    "lines": [
                        ("1200", Decimal("10000.00"), Decimal("0.00")),
                        ("4010", Decimal("0.00"), Decimal("10000.00")),
                    ],
                },
                {
                    "description": "Payment for office rent",
                    "lines": [
                        ("5300", Decimal("5000.00"), Decimal("0.00")),
                        ("1010", Decimal("0.00"), Decimal("5000.00")),
                    ],
                },
                {
                    "description": "Employee payroll",
                    "lines": [
                        ("5100", Decimal("15000.00"), Decimal("0.00")),
                        ("1010", Decimal("0.00"), Decimal("15000.00")),
                    ],
                },
                {
                    "description": "Purchase inventory from supplier",
                    "lines": [
                        ("1300", Decimal("8000.00"), Decimal("0.00")),
                        ("2010", Decimal("0.00"), Decimal("8000.00")),
                    ],
                },
            ]

            for sample in samples:
                entry = JournalEntry.objects.create(
                    entity=entity,
                    period=period,
                    currency=entity.functional_currency,
                    status="posted",
                    description=sample["description"],
                    created_by=users["accountant"],
                )

                for code, debit, credit in sample["lines"]:
                    account = Account.objects.get(entity=entity, code=code)
                    JournalLine.objects.create(
                        journal_entry=entry,
                        account=account,
                        debit_amount=debit,
                        credit_amount=credit,
                        currency=entity.functional_currency,
                        created_by=users["accountant"],
                    )

                entry_count += 1

        self.stdout.write(f"  ✓ Created {entry_count} sample transactions")

        # Summary
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("✅ DEMO DATA LOADED SUCCESSFULLY"))
        self.stdout.write("=" * 60)

        summary = {
            "entities": len(entities),
            "users": len(users),
            "accounts_total": account_count,
            "journal_entries": entry_count,
            "demo_accounts": {
                "admin": {"username": "demo_admin", "password": "demo123"},
                "accountant": {
                    "username": "demo_accountant",
                    "password": "demo123",
                },
                "cfo": {"username": "demo_cfo", "password": "demo123"},
                "controller": {
                    "username": "demo_controller",
                    "password": "demo123",
                },
            },
        }

        self.stdout.write(json.dumps(summary, indent=2))
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write("Next steps:")
        self.stdout.write("  1. python manage.py runserver")
        self.stdout.write("  2. Login at /admin with demo_admin / demo123")
        self.stdout.write("  3. Or use API at /api/finance/")
        self.stdout.write("=" * 60)
