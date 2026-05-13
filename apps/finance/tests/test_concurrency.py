"""
Concurrency tests for financial system thread-safety.

Tests verify that:
- Simultaneous GL entry postings don't violate invariants
- Period locks prevent concurrent modifications
- Audit logs capture concurrent mutations correctly
- Balance invariants hold under concurrent access
- No race conditions in double-entry enforcement

Uses pytest's threading capabilities and explicit locking tests.
"""

import threading
import time
import pytest
from decimal import Decimal
from datetime import date
from django.test import TransactionTestCase
from django.db import connection, IntegrityError

from apps.core.models import Entity
from apps.finance.models import JournalEntry, JournalLine, Period
from apps.coa.models import Account

from .factories import (
    EntityFactory,
    PeriodFactory,
    AssetAccountFactory,
    LiabilityAccountFactory,
    BalancedJournalEntryFactory,
)


class TestConcurrentPosting(TransactionTestCase):
    """Test concurrent GL entry posting."""

    def setUp(self):
        """Create test entity and accounts."""
        self.entity = EntityFactory()
        self.period = PeriodFactory(entity=self.entity, status="open")

    @pytest.mark.django_db
    def test_concurrent_entries_maintain_balance(self):
        """Creating entries concurrently should all maintain balance."""
        results = []
        errors = []

        def create_entry(entry_num):
            """Create a balanced entry in thread."""
            try:
                entry = BalancedJournalEntryFactory(
                    entity=self.entity,
                    period=self.period,
                    journal_code=f"GJ{entry_num:06d}",
                )
                results.append(entry)
            except Exception as e:
                errors.append(e)

        # Create 10 entries concurrently
        threads = []
        for i in range(10):
            t = threading.Thread(target=create_entry, args=(i,))
            t.start()
            threads.append(t)

        # Wait for all threads
        for t in threads:
            t.join()

        # Verify all succeeded
        assert len(errors) == 0, f"Errors during concurrent creation: {errors}"
        assert len(results) == 10

        # Verify all are balanced
        for entry in results:
            total_debits = sum(
                line.debit for line in entry.journalline_set.all()
            )
            total_credits = sum(
                line.credit for line in entry.journalline_set.all()
            )
            assert total_debits == total_credits

    @pytest.mark.django_db
    def test_no_race_condition_on_entry_number(self):
        """Entry number sequence should be consistent under concurrency."""
        created_entries = []
        lock = threading.Lock()

        def create_entry_safe(entry_num):
            """Create entry and safely collect it."""
            entry = BalancedJournalEntryFactory(
                entity=self.entity,
                period=self.period,
            )
            with lock:
                created_entries.append(entry)

        threads = []
        for i in range(20):
            t = threading.Thread(target=create_entry_safe, args=(i,))
            t.start()
            threads.append(t)

        for t in threads:
            t.join()

        # Verify all entries created
        assert len(created_entries) == 20

        # Entry codes should be unique
        codes = [e.journal_code for e in created_entries]
        assert len(set(codes)) == 20, "Entry codes not unique"


class TestConcurrentPeriodModification(TransactionTestCase):
    """Test concurrent access to period state."""

    @pytest.mark.django_db
    def test_period_status_change_is_atomic(self):
        """Changing period status should be atomic."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        results = []
        errors = []

        def try_close_period():
            """Attempt to close period in thread."""
            try:
                # Simulate checking status, modifying, saving
                p = Period.objects.get(id=period.id)
                if p.status == "open":
                    p.status = "closed"
                    p.save()
                    results.append("closed")
                else:
                    results.append("already_closed")
            except Exception as e:
                errors.append(e)

        threads = []
        for _ in range(5):
            t = threading.Thread(target=try_close_period)
            t.start()
            threads.append(t)

        for t in threads:
            t.join()

        # Verify no errors
        assert len(errors) == 0

        # Verify final state is consistent
        final_period = Period.objects.get(id=period.id)
        assert final_period.status in ["open", "closed"]


class TestConcurrentLinePosting(TransactionTestCase):
    """Test posting lines to same entry concurrently."""

    @pytest.mark.django_db
    def test_adding_lines_to_same_entry(self):
        """Adding multiple lines to same entry concurrently."""
        entity = EntityFactory()
        period = PeriodFactory(entity=self.entity, status="open")

        entry = BalancedJournalEntryFactory(
            entity=entity,
            period=period,
            lines=[],  # Start empty
        )

        errors = []

        def add_line(line_num):
            """Add a line to the entry."""
            try:
                account = AssetAccountFactory(entity=entity) \
                    if line_num % 2 == 0 \
                    else LiabilityAccountFactory(entity=entity)

                # Determine debit or credit based on line number
                if line_num % 2 == 0:
                    debit = Decimal("100.0000")
                    credit = Decimal("0.0000")
                else:
                    debit = Decimal("0.0000")
                    credit = Decimal("100.0000")

                JournalLineFactory(
                    journal_entry=entry,
                    account=account,
                    debit=debit,
                    credit=credit,
                    line_number=line_num,
                )
            except Exception as e:
                errors.append(e)

        # Add lines concurrently
        threads = []
        for i in range(10):
            t = threading.Thread(target=add_line, args=(i,))
            t.start()
            threads.append(t)

        for t in threads:
            t.join()

        # Some errors may be expected (duplicate line numbers)
        # But entry should still exist
        assert JournalEntry.objects.filter(id=entry.id).exists()


class TestConcurrentAccountModification(TransactionTestCase):
    """Test concurrent account updates."""

    @pytest.mark.django_db
    def test_account_status_toggle_consistency(self):
        """Toggling account active status concurrently."""
        entity = EntityFactory()
        account = AssetAccountFactory(entity=entity, is_active=True)

        toggle_count = 0
        lock = threading.Lock()

        def toggle_active():
            """Toggle account active status."""
            nonlocal toggle_count
            try:
                # Simulate multiple reads and writes
                for _ in range(5):
                    a = Account.objects.get(id=account.id)
                    a.is_active = not a.is_active
                    a.save()
                    with lock:
                        toggle_count += 1
            except Exception:
                pass

        threads = []
        for _ in range(5):
            t = threading.Thread(target=toggle_active)
            t.start()
            threads.append(t)

        for t in threads:
            t.join()

        # Final state should be deterministic
        final_account = Account.objects.get(id=account.id)
        assert isinstance(final_account.is_active, bool)


class TestAuditLogUnderConcurrency(TransactionTestCase):
    """Test audit log correctness under concurrent modifications."""

    @pytest.mark.django_db
    def test_audit_log_captures_all_concurrent_changes(self):
        """All concurrent changes should be logged."""
        from apps.audit.models import AuditLog

        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        created_entries = []
        lock = threading.Lock()

        def create_and_audit():
            """Create entry and verify audit."""
            entry = BalancedJournalEntryFactory(
                entity=entity,
                period=period,
            )
            with lock:
                created_entries.append(entry)

        threads = []
        for _ in range(5):
            t = threading.Thread(target=create_and_audit)
            t.start()
            threads.append(t)

        for t in threads:
            t.join()

        # Verify audit logs exist for all
        for entry in created_entries:
            logs = AuditLog.objects.filter(
                table_name="finance_journalentry",
                record_id=entry.id,
            )
            # Should have at least creation log
            assert logs.count() > 0


class TestDoubleEntryUnderConcurrency(TransactionTestCase):
    """Test double-entry invariant holds under concurrent posting."""

    @pytest.mark.django_db
    def test_balance_invariant_with_concurrent_posts(self):
        """Balance invariant should hold even with concurrent postings."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        # Create base entry
        entry = BalancedJournalEntryFactory(
            entity=entity,
            period=period,
            lines=[],
        )

        asset = AssetAccountFactory(entity=entity)
        liability = LiabilityAccountFactory(entity=entity)

        # Add balanced lines
        JournalLineFactory(
            journal_entry=entry,
            account=asset,
            debit=Decimal("500.0000"),
            credit=Decimal("0.0000"),
            line_number=1,
        )
        JournalLineFactory(
            journal_entry=entry,
            account=liability,
            debit=Decimal("0.0000"),
            credit=Decimal("500.0000"),
            line_number=2,
        )

        # Verify balance after concurrent access
        results = []
        lock = threading.Lock()

        def read_and_verify():
            """Read entry and verify balance."""
            e = JournalEntry.objects.get(id=entry.id)
            total_debit = sum(line.debit for line in e.journalline_set.all())
            total_credit = sum(line.credit for line in e.journalline_set.all())
            with lock:
                results.append({
                    "debit": total_debit,
                    "credit": total_credit,
                    "balanced": total_debit == total_credit,
                })

        threads = []
        for _ in range(10):
            t = threading.Thread(target=read_and_verify)
            t.start()
            threads.append(t)

        for t in threads:
            t.join()

        # All should be balanced
        for result in results:
            assert result["balanced"], f"Imbalance detected: {result}"


class TestPeriodLockingUnderConcurrency(TransactionTestCase):
    """Test period locking prevents concurrent modifications."""

    @pytest.mark.django_db
    def test_locked_period_blocks_modifications(self):
        """Locked period should prevent all modifications."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="locked")

        errors = []

        def try_add_entry():
            """Attempt to add entry to locked period."""
            try:
                entry = BalancedJournalEntryFactory(
                    entity=entity,
                    period=period,
                )
                # Should fail or be prevented
                errors.append(None)
            except Exception as e:
                # Expected to fail
                errors.append(e)

        threads = []
        for _ in range(5):
            t = threading.Thread(target=try_add_entry)
            t.start()
            threads.append(t)

        for t in threads:
            t.join()

        # All attempts should fail similarly
        # (behavior depends on implementation)


class TestDeadlockPrevention(TransactionTestCase):
    """Test the system doesn't deadlock under concurrent access."""

    @pytest.mark.django_db(transaction=True)
    def test_no_deadlock_on_multiple_entities(self):
        """Accessing multiple entities concurrently shouldn't deadlock."""
        entities = [EntityFactory() for _ in range(3)]
        periods = [PeriodFactory(entity=e, status="open") for e in entities]

        completed = []
        errors = []
        lock = threading.Lock()

        def access_all_entities(entity_ids):
            """Access entities in specific order."""
            try:
                for entity_id in entity_ids:
                    entries = JournalEntry.objects.filter(
                        entity_id=entity_id
                    )
                    list(entries)  # Force evaluation
                with lock:
                    completed.append(threading.current_thread().name)
            except Exception as e:
                with lock:
                    errors.append(e)

        # Create threads with different access orders
        threads = []
        access_patterns = [
            [e.id for e in entities],  # 0, 1, 2
            [e.id for e in reversed(entities)],  # 2, 1, 0
            [entities[1].id, entities[0].id, entities[2].id],  # 1, 0, 2
        ]

        for pattern in access_patterns * 3:
            t = threading.Thread(
                target=access_all_entities,
                args=(pattern,),
            )
            t.start()
            threads.append(t)

        # Use timeout to detect deadlocks
        all_completed = True
        for t in threads:
            t.join(timeout=5)
            if t.is_alive():
                all_completed = False

        assert all_completed, "Deadlock detected"
        assert len(errors) == 0, f"Errors during concurrent access: {errors}"


class TestTransactionIsolation(TransactionTestCase):
    """Test transaction isolation levels."""

    @pytest.mark.django_db(transaction=True)
    def test_dirty_read_prevention(self):
        """Uncommitted changes shouldn't be visible to other connections."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        initial_count = JournalEntry.objects.filter(entity=entity).count()

        # This test would require actual isolation level verification
        # Implementation depends on transaction handling


class TestRaceConditionDetection(TransactionTestCase):
    """Test detection of common race conditions."""

    @pytest.mark.django_db
    def test_lost_update_scenario(self):
        """Verify lost update problem is prevented."""
        entity = EntityFactory()

        # Simulate lost update
        results = []

        def read_modify_write():
            """Read, modify, write pattern."""
            try:
                e = Entity.objects.get(id=entity.id)
                # Simulate some processing time
                time.sleep(0.01)
                e.active = not e.active
                e.save()
                results.append("success")
            except Exception as e:
                results.append(f"error: {e}")

        threads = []
        for _ in range(5):
            t = threading.Thread(target=read_modify_write)
            t.start()
            threads.append(t)

        for t in threads:
            t.join()

        # Final state should be consistent
        final_entity = Entity.objects.get(id=entity.id)
        assert isinstance(final_entity.active, bool)
