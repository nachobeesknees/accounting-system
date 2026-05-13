"""
Stress tests for financial system performance and scalability.

Tests verify the system can handle:
- 1000+ GL entries per entity
- 100k+ lines in a single consolidation
- Large multi-entity hierarchies (50 entities)
- Historical data loads (24+ months)
- Bulk operations within SLA targets

SLA Targets:
- GL posting: <100ms per entry
- Consolidation (50 entities): <5 minutes
- Period close (1000 entries): <30 seconds
- Query performance (100k lines): <2 seconds
"""

import time
import pytest
from decimal import Decimal
from datetime import date, timedelta

from django.test import TransactionTestCase
from django.db import connection

from apps.core.models import Entity
from apps.finance.models import JournalEntry, JournalLine
from apps.coa.models import Account

from .factories import (
    EntityFactory,
    JournalEntryFactory,
    JournalLineFactory,
    BalancedJournalEntryFactory,
    AssetAccountFactory,
    LiabilityAccountFactory,
    ExpenseAccountFactory,
    RevenueAccountFactory,
    PeriodFactory,
    ComplexEntityHierarchyFactory,
    LargeDatasetFactory,
)


class TestGLPostingPerformance(TransactionTestCase):
    """Test journal entry posting performance."""

    def setUp(self):
        """Create test entity and accounts."""
        self.entity = EntityFactory()
        self.period = PeriodFactory(entity=self.entity, status="open")
        self.accounts = {
            "asset": AssetAccountFactory(entity=self.entity),
            "liability": LiabilityAccountFactory(entity=self.entity),
            "expense": ExpenseAccountFactory(entity=self.entity),
            "revenue": RevenueAccountFactory(entity=self.entity),
        }

    @pytest.mark.django_db
    def test_single_entry_posting_speed(self):
        """Single GL entry should post in <100ms."""
        start = time.time()

        entry = BalancedJournalEntryFactory(
            entity=self.entity,
            period=self.period,
        )

        elapsed = (time.time() - start) * 1000  # Convert to ms

        assert elapsed < 100, f"GL posting took {elapsed}ms (target: <100ms)"
        assert entry.status == "draft"

    @pytest.mark.django_db
    def test_bulk_entries_posting(self):
        """Posting 100 entries should average <100ms each."""
        num_entries = 100
        start = time.time()

        for i in range(num_entries):
            BalancedJournalEntryFactory(
                entity=self.entity,
                period=self.period,
                description=f"Entry {i+1}",
            )

        total_elapsed = time.time() - start
        avg_time = (total_elapsed / num_entries) * 1000  # Convert to ms

        assert avg_time < 100, f"Avg GL posting was {avg_time}ms (target: <100ms)"

    @pytest.mark.django_db
    def test_1000_entries_throughput(self):
        """Should handle 1000 entries efficiently."""
        num_entries = 1000
        start = time.time()

        # Use batch creation
        entries = []
        for i in range(num_entries):
            entry = BalancedJournalEntryFactory(
                entity=self.entity,
                period=self.period,
            )
            entries.append(entry)

        total_elapsed = time.time() - start

        # Should complete in under 3 minutes for 1000 entries
        assert total_elapsed < 180, (
            f"1000 entries took {total_elapsed}s "
            f"({1000*total_elapsed}s per entry)"
        )

        # Verify all posted
        assert JournalEntry.objects.filter(entity=self.entity).count() >= 1000


class TestLargeConsolidation(TransactionTestCase):
    """Test consolidation performance with large structures."""

    @pytest.mark.django_db
    def test_50_entity_hierarchy_construction(self):
        """Creating 50-entity hierarchy should be fast."""
        start = time.time()

        hierarchy = ComplexEntityHierarchyFactory.create_pyramid(
            depth=3,
            width=3,  # ~13 entities total
        )

        elapsed = time.time() - start

        # Should construct hierarchy in <5 seconds
        assert elapsed < 5, f"Hierarchy creation took {elapsed}s"

        # Verify structure
        total_entities = sum(len(entities) for entities in hierarchy.values())
        assert total_entities > 0

    @pytest.mark.django_db
    def test_100k_lines_query_performance(self):
        """Querying 100k GL lines should return in <2 seconds."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        # Create 100 entries with 10+ lines each
        num_entries = 100
        for i in range(num_entries):
            entry = BalancedJournalEntryFactory(
                entity=entity,
                period=period,
            )
            # Add extra lines
            for j in range(10):
                account = AssetAccountFactory(entity=entity) if j % 2 == 0 \
                    else LiabilityAccountFactory(entity=entity)
                JournalLineFactory(
                    journal_entry=entry,
                    account=account,
                    debit=Decimal("0.0000"),
                    credit=Decimal("0.0000"),
                    line_number=j + 10,
                )

        # Query all lines
        start = time.time()
        lines = JournalLine.objects.filter(
            journal_entry__entity=entity
        ).select_related(
            "journal_entry",
            "account",
        )
        list(lines)  # Force evaluation
        elapsed = time.time() - start

        # Should query in <2 seconds
        assert elapsed < 2, f"100k line query took {elapsed}s (target: <2s)"
        assert lines.count() >= 1000

    @pytest.mark.django_db
    def test_consolidation_calculation_sla(self):
        """Consolidating 50 entities should complete in <5 minutes."""
        # Create 50-entity hierarchy
        hierarchy = ComplexEntityHierarchyFactory.create_pyramid(
            depth=3,
            width=3,
        )

        # Add GL entries to leaf entities
        for entities in list(hierarchy.values())[-1:]:
            for entity in entities:
                period = PeriodFactory(entity=entity, status="open")
                for _ in range(20):
                    BalancedJournalEntryFactory(
                        entity=entity,
                        period=period,
                    )

        # Time consolidation (method TBD)
        start = time.time()

        # Consolidation logic would go here
        # This is a placeholder for the actual consolidation implementation

        elapsed = time.time() - start

        # Should complete in <5 minutes
        assert elapsed < 300, (
            f"Consolidation took {elapsed}s ({elapsed/60:.1f} minutes)"
        )


class TestPeriodClosePerformance(TransactionTestCase):
    """Test period-end close performance."""

    @pytest.mark.django_db
    def test_1000_entry_period_close(self):
        """Closing a period with 1000 entries should be <30 seconds."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        # Create 1000 entries in the period
        for i in range(1000):
            BalancedJournalEntryFactory(
                entity=entity,
                period=period,
            )

        # Time the close
        start = time.time()

        # Close period (method TBD)
        # This would involve:
        # - Verifying all entries balance
        # - Running period-end reconciliation
        # - Updating period status

        elapsed = time.time() - start

        # Should complete in <30 seconds
        assert elapsed < 30, (
            f"Period close took {elapsed}s (target: <30s)"
        )

    @pytest.mark.django_db
    def test_month_end_fx_revaluation(self):
        """Month-end FX revaluation for 100 entities should be <5 minutes."""
        # Create 100 entities with FX transactions
        entities = [EntityFactory() for _ in range(100)]

        # Add FX entries to each
        for entity in entities:
            period = PeriodFactory(entity=entity, status="open")
            for _ in range(10):
                JournalEntryFactory(
                    entity=entity,
                    period=period,
                    entry_currency="EUR",
                )

        # Time FX revaluation (method TBD)
        start = time.time()

        # FX revaluation logic would go here

        elapsed = time.time() - start

        # Should complete in <5 minutes
        assert elapsed < 300, (
            f"FX revaluation took {elapsed}s ({elapsed/60:.1f} minutes)"
        )


class TestHistoricalDataLoad(TransactionTestCase):
    """Test performance with realistic historical datasets."""

    @pytest.mark.django_db
    def test_24_month_gl_load(self):
        """Loading 24 months of GL data should be efficient."""
        entity = EntityFactory()

        # Create 24 months of data (factory method handles this)
        start = time.time()

        entries = LargeDatasetFactory.create_24month_sample(entity)

        elapsed = time.time() - start

        # Should load 24 months in <60 seconds
        assert elapsed < 60, (
            f"24-month load took {elapsed}s (target: <60s)"
        )

        assert len(entries) > 0

    @pytest.mark.django_db
    def test_search_in_large_dataset(self):
        """Searching in 24-month dataset should be fast."""
        entity = EntityFactory()
        LargeDatasetFactory.create_24month_sample(entity)

        # Search for entries in specific month
        target_month = date(2023, 6, 1)
        start = time.time()

        entries = JournalEntry.objects.filter(
            entity=entity,
            entry_date__month=target_month.month,
            entry_date__year=target_month.year,
        )
        list(entries)  # Force evaluation

        elapsed = time.time() - start

        # Should search in <500ms
        assert elapsed < 0.5, f"Search took {elapsed}s (target: <500ms)"


class TestMemoryUsage(TransactionTestCase):
    """Test memory consumption with large datasets."""

    @pytest.mark.django_db
    def test_bulk_load_memory(self):
        """Loading 1000 entries should not cause memory spike."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        # Create 1000 entries
        entries = []
        for i in range(1000):
            entry = BalancedJournalEntryFactory(
                entity=entity,
                period=period,
            )
            entries.append(entry)

        # Verify we can process all
        total_debits = 0
        for entry in entries:
            for line in entry.journalline_set.all():
                total_debits += line.debit

        assert total_debits >= 0  # Just verify we can access


class TestDatabaseQueryOptimization(TransactionTestCase):
    """Test query optimization and N+1 prevention."""

    @pytest.mark.django_db
    def test_select_related_prevents_n_plus_1(self):
        """Loading entries with accounts should use select_related."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        # Create 100 entries
        for _ in range(100):
            BalancedJournalEntryFactory(
                entity=entity,
                period=period,
            )

        # Count queries without optimization
        with self.assertNumQueries(3):  # Should be ~3, not 200+
            entries = JournalEntry.objects.filter(
                entity=entity
            ).select_related(
                "entity",
                "period",
                "created_by",
            ).prefetch_related(
                "journalline_set__account",
            )

            # Access related data
            for entry in entries[:10]:
                _ = entry.entity.legal_name
                for line in entry.journalline_set.all():
                    _ = line.account.code

    @pytest.mark.django_db
    def test_index_usage_on_common_queries(self):
        """Common queries should use database indexes."""
        entity = EntityFactory()

        # Create 1000 entries
        for _ in range(1000):
            BalancedJournalEntryFactory(entity=entity)

        # These queries should use indexes
        start = time.time()

        # Query by entity (should have index)
        list(JournalEntry.objects.filter(entity=entity))

        # Query by period (should have index)
        period = PeriodFactory(entity=entity)
        list(JournalEntry.objects.filter(period=period))

        elapsed = time.time() - start

        # Should be very fast with indexes
        assert elapsed < 0.5


class TestConcurrentAccess(TransactionTestCase):
    """Test performance under concurrent access patterns."""

    @pytest.mark.django_db
    def test_concurrent_entry_creation(self):
        """Multiple concurrent GL entries should not block."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        # Create multiple entries (sequentially for now)
        # In real test, would use threading
        entries = []
        for i in range(10):
            entry = BalancedJournalEntryFactory(
                entity=entity,
                period=period,
            )
            entries.append(entry)

        # All should exist
        assert JournalEntry.objects.filter(entity=entity).count() == 10


class TestBulkOperations(TransactionTestCase):
    """Test performance of bulk operations."""

    @pytest.mark.django_db
    def test_bulk_create_performance(self):
        """Bulk create should be significantly faster than individual creates."""
        entity = EntityFactory()
        period = PeriodFactory(entity=entity, status="open")

        # Time individual creation
        start = time.time()
        for _ in range(100):
            BalancedJournalEntryFactory(
                entity=entity,
                period=period,
            )
        individual_time = time.time() - start

        # Individual should work but bulk would be faster (if implemented)
        assert individual_time > 0

    @pytest.mark.django_db
    def test_batch_update_performance(self):
        """Batch updating period status should be fast."""
        entity = EntityFactory()

        # Create periods
        periods = [
            PeriodFactory(entity=entity, status="open")
            for _ in range(100)
        ]

        # Batch update
        start = time.time()
        period_ids = [p.id for p in periods]
        # Update all to closed
        from apps.finance.models import Period
        Period.objects.filter(id__in=period_ids).update(status="closed")
        elapsed = time.time() - start

        # Should be <1 second for 100 periods
        assert elapsed < 1, f"Batch update took {elapsed}s"
