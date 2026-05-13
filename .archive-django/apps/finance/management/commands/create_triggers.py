"""
Django management command to create Postgres triggers for accounting invariants.
This must be run after migrations to enforce business rules at the database level.

Usage:
    python manage.py create_triggers
"""

from django.core.management.base import BaseCommand
from django.db import connection
from pathlib import Path


class Command(BaseCommand):
    help = "Create Postgres triggers for accounting invariants"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Drop existing triggers and recreate them",
        )

    def handle(self, *args, **options):
        trigger_file = Path(__file__).parent.parent.parent / "sql" / "triggers.sql"

        if not trigger_file.exists():
            self.stdout.write(
                self.style.ERROR(f"Trigger file not found: {trigger_file}")
            )
            return

        with open(trigger_file, "r") as f:
            trigger_sql = f.read()

        with connection.cursor() as cursor:
            try:
                self.stdout.write(self.style.WARNING("Creating triggers..."))

                # Drop existing triggers if --force
                if options["force"]:
                    self.stdout.write("Dropping existing triggers...")
                    triggers_to_drop = [
                        "trg_enforce_double_entry",
                        "trg_prevent_posted_modification",
                        "trg_prevent_closed_period_post",
                        "trg_audit_journalentry",
                        "trg_audit_journalline",
                        "trg_audit_account",
                        "trg_audit_generalledger",
                        "trg_audit_period",
                        "trg_enforce_entry_currency",
                        "trg_enforce_entity_entry",
                    ]
                    for trigger in triggers_to_drop:
                        try:
                            cursor.execute(f"DROP TRIGGER IF EXISTS {trigger} ON finance_journalentry;")
                            cursor.execute(f"DROP TRIGGER IF EXISTS {trigger} ON finance_journalline;")
                            cursor.execute(f"DROP TRIGGER IF EXISTS {trigger} ON finance_account;")
                            cursor.execute(f"DROP TRIGGER IF EXISTS {trigger} ON finance_generalledger;")
                            cursor.execute(f"DROP TRIGGER IF EXISTS {trigger} ON finance_period;")
                        except Exception:
                            pass

                # Execute trigger creation SQL
                cursor.execute(trigger_sql)
                connection.commit()

                self.stdout.write(
                    self.style.SUCCESS(
                        "✅ Triggers created successfully. Accounting invariants are now enforced at database level."
                    )
                )

                # List created triggers
                cursor.execute(
                    """
                    SELECT trigger_name, event_object_table
                    FROM information_schema.triggers
                    WHERE trigger_schema = 'public'
                      AND trigger_name LIKE 'trg_%'
                    ORDER BY event_object_table, trigger_name
                    """
                )
                triggers = cursor.fetchall()

                if triggers:
                    self.stdout.write("\nActive triggers:")
                    for trigger_name, table_name in triggers:
                        self.stdout.write(f"  ✓ {trigger_name} on {table_name}")

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"❌ Error creating triggers: {str(e)}")
                )
                raise
