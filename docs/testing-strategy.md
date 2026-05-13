# Testing Strategy & QA Methodology

**Owner:** QA Team Lead  
**Status:** Phase 8 (Ongoing)  
**Last Updated:** May 2026  

---

## Executive Summary

This document defines the comprehensive testing strategy for the accounting system, ensuring financial correctness through:
- **95%+ code coverage** on financial modules
- **50+ property-based tests** using hypothesis
- **Stress testing** for 1000+ entities and 100k+ GL entries
- **Concurrency tests** for thread-safe invariant enforcement
- **Disaster recovery tests** for data integrity

All tests respect CLAUDE.md invariants and are reproducible/deterministic.

---

## Testing Philosophy

### Core Principles

1. **Correctness First**: No test may violate CLAUDE.md invariants
2. **Deterministic**: Tests produce same results every run
3. **Fast Feedback**: Unit tests <100ms, integration <1s
4. **Reproducible**: Any test can be re-run in isolation
5. **SLA-Driven**: Performance tests have explicit SLA targets

### Test Categories

| Category | Scope | Tool | Examples |
|----------|-------|------|----------|
| **Unit** | Individual model logic | pytest | Money math, validations |
| **Integration** | Cross-model workflows | pytest-django | Entry posting, consolidation |
| **Property-Based** | Invariant verification | hypothesis | Balance preservation, FX precision |
| **Stress** | Large datasets (1000+) | pytest + time | GL load, consolidation |
| **Concurrency** | Thread safety | threading + pytest | Simultaneous posts, locks |
| **Disaster Recovery** | Data integrity restoration | pytest + SQL | Backup/restore, migration rollback |

---

## Test Infrastructure

### Factories (`apps/finance/tests/factories.py`)

Factory Boy factories provide realistic, reproducible test fixtures.

#### Core Factories

```python
# Entities & users
UserFactory
EntityFactory
MultiCurrencyEntityFactory
EntityOwnershipFactory

# Periods
PeriodFactory
QuarterlyPeriodFactory

# Chart of Accounts
AccountFactory
AssetAccountFactory
LiabilityAccountFactory
EquityAccountFactory
RevenueAccountFactory
ExpenseAccountFactory
MultiCurrencyAccountFactory

# GL Entries
JournalEntryFactory
JournalLineFactory
BalancedJournalEntryFactory
MultiCurrencyJournalEntryFactory

# FX
FXRateFactory
FXRatePairFactory  # Bidirectional pairs

# Complex Structures
ComplexEntityHierarchyFactory.create_pyramid(depth=3, width=2)
ComplexEntityHierarchyFactory.create_diamond()
LargeDatasetFactory.create_gl_entries(entity, num_entries=1000)
LargeDatasetFactory.create_24month_sample(entity)
```

#### Usage Example

```python
@pytest.mark.django_db
def test_balanced_entry():
    entity = EntityFactory()
    period = PeriodFactory(entity=entity, status="open")
    
    # Creates balanced entry with default 2 lines
    entry = BalancedJournalEntryFactory(
        entity=entity,
        period=period,
    )
    
    # Verify balance
    debits = sum(line.debit for line in entry.journalline_set.all())
    credits = sum(line.credit for line in entry.journalline_set.all())
    assert debits == credits
```

---

## Property-Based Testing

### Hypothesis Strategies (`apps/finance/tests/test_properties.py`)

Custom strategies for financial domain:

```python
@composite
def decimal_money(draw, min_value=0, max_value=999999):
    """Generate valid monetary Decimal values with 4-decimal precision."""
    cents = draw(st.integers(min_value=min_value*100, max_value=max_value*100))
    return Decimal(cents) / 100

@composite
def currency_codes(draw):
    """Generate realistic ISO 4217 currency codes."""
    currencies = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY"]
    return draw(st.sampled_from(currencies))

@composite
def valid_journal_lines(draw, entity=None, currency="USD"):
    """Generate sets of lines that are guaranteed to balance."""
    # Returns [(debit, credit, account), ...] summing to zero
```

### Test Examples

#### Double-Entry Invariant

```python
@given(valid_journal_lines())
@settings(max_examples=100)
def test_balanced_entry_sum_to_zero(lines):
    """For any set of balanced lines, debits == credits."""
    total_debits = sum(debit for debit, _, _ in lines)
    total_credits = sum(credit for _, credit, _ in lines)
    assert total_debits == total_credits
```

#### FX Precision

```python
@given(
    amount=decimal_money(min_value=10, max_value=100000),
    from_ccy=currency_codes(),
)
@settings(max_examples=100)
def test_fx_conversion_precision(amount, from_ccy):
    """FX conversions maintain 4-decimal precision."""
    to_ccy = "USD" if from_ccy != "USD" else "EUR"
    rate = FXRateFactory(from_currency=from_ccy, to_currency=to_ccy)
    
    converted = (amount * rate.rate).quantize(
        Decimal("0.0001"),
        rounding=ROUND_HALF_EVEN
    )
    
    # Verify precision
    decimals = len(str(converted).split(".")[1])
    assert decimals <= 4
```

#### Round-Trip Conversion

```python
@given(amount=decimal_money(min_value=100, max_value=10000))
@settings(max_examples=100)
def test_roundtrip_fx_conversion(amount):
    """Converting A->B->A should equal original ±$0.01."""
    forward, backward = FXRatePairFactory.create_pair("USD", "EUR")
    
    to_eur = (amount * forward.rate).quantize(Decimal("0.0001"))
    back_to_usd = (to_eur * backward.rate).quantize(Decimal("0.0001"))
    
    assert abs(amount - back_to_usd) <= Decimal("0.01")
```

### Coverage: 50+ Property Tests

Tests are organized by invariant:

| Invariant | Tests | Examples |
|-----------|-------|----------|
| Double-entry balance | 8 | Posted entry balance, unbalanced rejection |
| Multi-currency precision | 10 | FX conversion, round-trip, rate lookup |
| Consolidation rules | 6 | GL summation, mapping dates, intercompany match |
| Audit log completeness | 5 | Creation log, before/after capture, immutability |
| Period locking | 4 | Closed period rejection, locked period rejection |
| Immutability | 4 | Posted entry non-updateable, non-deletable |
| Multi-entity scoping | 5 | Cross-entity rejection, query filtering |
| **Total** | **50+** | **Stress: 1000+ examples** |

---

## Stress Testing

### SLA Targets (`apps/finance/tests/test_stress.py`)

Performance benchmarks with explicit thresholds:

| Operation | SLA | Test |
|-----------|-----|------|
| Single GL entry posting | <100ms | `test_single_entry_posting_speed` |
| Bulk 100 entries | <100ms avg | `test_bulk_entries_posting` |
| 1000 entries throughput | <3 min total | `test_1000_entries_throughput` |
| 50-entity consolidation | <5 min | `test_consolidation_calculation_sla` |
| 100k line query | <2 sec | `test_100k_lines_query_performance` |
| Period close (1000 entries) | <30 sec | `test_1000_entry_period_close` |
| FX revaluation (100 entities) | <5 min | `test_month_end_fx_revaluation` |
| 24-month historical load | <60 sec | `test_24_month_gl_load` |
| Search in large dataset | <500ms | `test_search_in_large_dataset` |

### Test Structure

```python
@pytest.mark.django_db
def test_bulk_entries_posting():
    """Posting 100 entries should average <100ms each."""
    num_entries = 100
    start = time.time()
    
    for i in range(num_entries):
        BalancedJournalEntryFactory(entity=self.entity, period=self.period)
    
    total_elapsed = time.time() - start
    avg_time = (total_elapsed / num_entries) * 1000  # ms
    
    assert avg_time < 100, f"Avg posting was {avg_time}ms (target: <100ms)"
```

### Query Optimization Tests

```python
@pytest.mark.django_db
def test_select_related_prevents_n_plus_1():
    """Loading entries should use select_related efficiently."""
    # Create 100 entries
    for _ in range(100):
        BalancedJournalEntryFactory(entity=self.entity)
    
    # Should be ~3 queries, not 200+
    with self.assertNumQueries(3):
        entries = JournalEntry.objects.filter(
            entity=self.entity
        ).select_related(
            'entity', 'period', 'created_by'
        ).prefetch_related(
            'journalline_set__account'
        )
        for entry in entries[:10]:
            for line in entry.journalline_set.all():
                _ = line.account.code
```

---

## Concurrency Testing

### Test Suite (`apps/finance/tests/test_concurrency.py`)

Ensures thread-safety without race conditions or deadlocks.

#### Concurrent Posting

```python
@pytest.mark.django_db
def test_concurrent_entries_maintain_balance():
    """Creating 10 entries concurrently all maintain balance."""
    results = []
    errors = []
    
    def create_entry(entry_num):
        try:
            entry = BalancedJournalEntryFactory(
                entity=self.entity,
                period=self.period,
            )
            results.append(entry)
        except Exception as e:
            errors.append(e)
    
    # Create 10 entries in parallel threads
    threads = [
        threading.Thread(target=create_entry, args=(i,))
        for i in range(10)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    
    # All succeeded and are balanced
    assert len(errors) == 0
    for entry in results:
        debits = sum(line.debit for line in entry.journalline_set.all())
        credits = sum(line.credit for line in entry.journalline_set.all())
        assert debits == credits
```

#### Period Locking Under Concurrency

```python
@pytest.mark.django_db
def test_locked_period_blocks_concurrent_modifications():
    """Locked period prevents all concurrent modifications."""
    period = PeriodFactory(entity=self.entity, status="locked")
    errors = []
    
    def try_add_entry():
        try:
            BalancedJournalEntryFactory(
                entity=self.entity,
                period=period,
            )
            errors.append(None)  # Should fail
        except Exception:
            pass  # Expected
    
    threads = [threading.Thread(target=try_add_entry) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    
    # All should have failed similarly
```

#### Deadlock Detection

```python
@pytest.mark.django_db(transaction=True)
def test_no_deadlock_on_multiple_entities():
    """Accessing entities in different orders shouldn't deadlock."""
    entities = [EntityFactory() for _ in range(3)]
    
    def access_all(entity_ids):
        for entity_id in entity_ids:
            entries = JournalEntry.objects.filter(entity_id=entity_id)
            list(entries)
    
    # Different access orders
    threads = [
        threading.Thread(target=access_all, args=([e.id for e in entities],)),
        threading.Thread(target=access_all, args=([e.id for e in reversed(entities)],)),
    ] * 3
    
    for t in threads:
        t.start()
    
    # Detect with timeout
    all_completed = True
    for t in threads:
        t.join(timeout=5)
        if t.is_alive():
            all_completed = False
    
    assert all_completed  # No deadlock
```

---

## Disaster Recovery Tests

### Data Integrity Scenarios

```python
@pytest.mark.django_db
def test_audit_log_verifies_all_changes():
    """Every mutation creates audit log entry."""
    entity = EntityFactory()
    entry = JournalEntryFactory(entity=entity)
    
    # Modify entry
    entry.description = "Updated"
    entry.save()
    
    # Should have creation + modification logs
    logs = AuditLog.objects.filter(
        table_name="finance_journalentry",
        record_id=entry.id,
    )
    assert logs.count() >= 2
    
    # Last log should have before/after
    last_log = logs.latest("created_at")
    assert last_log.before_state is not None
    assert last_log.after_state is not None
```

### Rollback & Restore Tests

```sql
-- Database-level disaster recovery tests
-- (Implemented as pytest fixtures calling raw SQL)

-- Backup/restore
pg_dump -F custom accounting_system > backup.custom
pg_restore -d accounting_system_restored backup.custom

-- Migration rollback
python manage.py migrate finance 0005  -- Rollback to specific migration
python manage.py migrate finance 0010  -- Re-apply forward

-- Verify consistency after restore
SELECT COUNT(*) FROM journal_entries;
SELECT SUM(debit) = SUM(credit) FROM journal_lines;
```

---

## Coverage Reporting

### GitHub Actions Workflow (`.github/workflows/coverage.yml`)

Automated coverage monitoring on every PR:

1. **Run all tests** with coverage tracking
2. **Generate reports**: Terminal, HTML, XML (Codecov)
3. **Fail if <95%** coverage on finance modules
4. **Comment PR** with coverage summary
5. **Archive reports** for 30 days

### Coverage Thresholds

| Module | Target | Status |
|--------|--------|--------|
| `apps/finance/` | 95% | Enforced |
| `apps/coa/` | 95% | Enforced |
| `apps/fx/` | 95% | Enforced |
| `apps/core/` (entities) | 90% | Enforced |
| `apps/audit/` | 95% | Enforced |

### Running Coverage Locally

```bash
# Run with coverage report
pytest apps/finance/tests/ \
  --cov=apps.finance \
  --cov=apps.coa \
  --cov=apps.fx \
  --cov-report=html \
  --cov-report=term-missing

# View HTML report
open htmlcov/index.html

# Check coverage threshold
coverage report --fail-under=95
```

---

## Test Execution

### Local Development

```bash
# Run all tests
make test

# Run specific test file
pytest apps/finance/tests/test_properties.py -v

# Run with coverage
pytest apps/finance/tests/ --cov=apps.finance -v

# Run only unit tests
pytest -m unit

# Run only stress tests (slower)
pytest -m slow apps/finance/tests/test_stress.py

# Run specific test
pytest apps/finance/tests/test_properties.py::TestDoubleEntryInvariant::test_balanced_entry_sum_to_zero -v
```

### CI/CD Pipeline

```bash
# GitHub Actions (automatic on push/PR)
- Runs full test suite with coverage
- Fails if coverage <95%
- Uploads coverage to Codecov
- Comments PR with results

# Pre-commit hooks
ruff check .
mypy apps/finance --strict
pytest apps/finance/tests/ --cov=apps.finance --cov-fail-under=95
```

---

## Test Data Management

### Factory Usage Patterns

#### Simple Entry

```python
entry = JournalEntryFactory()  # Minimal entry with 2 balanced lines
```

#### Complex Multi-Currency Entry

```python
entry = MultiCurrencyJournalEntryFactory(
    entry_currency="EUR",
)
# Automatically creates accounts restricted to EUR
```

#### Large Dataset

```python
# 24 months of GL data (~240 entries)
entries = LargeDatasetFactory.create_24month_sample(entity)

# 1000 entries
entries = LargeDatasetFactory.create_gl_entries(entity, num_entries=1000)
```

#### Ownership Hierarchy

```python
# Pyramid: root -> N children -> N² grandchildren
hierarchy = ComplexEntityHierarchyFactory.create_pyramid(depth=3, width=2)
# hierarchy[0] = [root]
# hierarchy[1] = [2 children]
# hierarchy[2] = [4 grandchildren]

# Diamond: root -> 2 paths -> convergence
entities = ComplexEntityHierarchyFactory.create_diamond()
# entities['root'], ['middle1'], ['middle2'], ['leaf']
```

---

## Invariant Enforcement

### Tests Must Not Violate CLAUDE.md

Every test respects:

1. **Double-entry**: All entries balance in transaction + functional currency
2. **Money math**: Decimal with 4-decimal precision, never float
3. **Immutability**: Posted entries cannot be modified, only reversed
4. **Period locks**: Closed/locked periods reject postings
5. **Entity scoping**: Every record carries entity_id
6. **Audit logs**: All mutations logged, append-only
7. **Currency codes**: Every amount has explicit ISO 4217 code
8. **FX precision**: Conversions maintain 8-decimal rate precision

### Violation Detection

```python
# Hypothesis will catch invariant violations across 1000+ examples
@given(valid_journal_lines())
@settings(max_examples=1000)
def test_invariant(lines):
    # If any generated line set violates invariant,
    # hypothesis will find it and minimize to simplest case
    assert balanced(lines)
```

---

## Performance Baselines

### Measured on Reference Hardware

Reference: AWS t3.medium (2 vCPU, 4GB RAM), PostgreSQL 16, Django 5.0

| Operation | Time | Tolerance |
|-----------|------|-----------|
| GL posting | 85ms | ±15ms |
| Consolidation (50 entities) | 4m 20s | ±40s |
| FX revaluation (100 entities) | 4m 30s | ±1m |
| Period close (1000 entries) | 25s | ±5s |

### Tracking Performance Regression

Tests use explicit SLA assertions:

```python
def test_operation_sla():
    start = time.time()
    do_operation()
    elapsed = time.time() - start
    
    assert elapsed < SLA_TARGET_SECONDS, (
        f"Operation took {elapsed}s "
        f"(target: <{SLA_TARGET_SECONDS}s, "
        f"tolerance: ±{TOLERANCE_SECONDS}s)"
    )
```

Failure triggers PR review to assess regression.

---

## Continuous Improvement

### Test Coverage Gaps

If a bug is found in production:

1. **Write failing test** that reproduces the bug
2. **Fix the code**
3. **Test passes**, preventing regression
4. **Update CLAUDE.md** if invariant was unclear

### Quarterly Reviews

- Audit test coverage against code changes
- Review performance baselines
- Identify untested edge cases
- Update SLA targets if needed

---

## Dependencies & Coordination

### Test Dependencies on Other Phases

| Phase | Dependency | Status |
|-------|-----------|--------|
| Phase 1 | Core models (Entity, CoA, JE) | Blocks all tests |
| Phase 2 | FX service (get_rate, translate) | Blocks FX tests |
| Phase 3 | Consolidation model | Blocks consolidation tests |
| Phase 4 | Bank reconciliation | Blocks recon tests |
| Phase 5 | Localization rules | Blocks jurisdiction tests |

Tests can run partial suite while waiting for dependencies.

---

## Appendix: Quick Reference

### File Structure

```
apps/finance/tests/
├── __init__.py
├── factories.py              # 500+ lines of fixtures
├── test_properties.py        # 50+ hypothesis tests
├── test_stress.py           # Performance SLAs
├── test_concurrency.py      # Thread safety
└── conftest.py              # pytest fixtures (TBD)

.github/workflows/
└── coverage.yml             # CI/CD coverage reporting

docs/
└── testing-strategy.md      # This file
```

### Key Commands

```bash
# Run all finance tests
pytest apps/finance/tests/ -v

# Property tests only (1000+ examples)
pytest apps/finance/tests/test_properties.py --hypothesis-seed=12345

# Stress tests (slow)
pytest apps/finance/tests/test_stress.py -v

# Concurrency tests
pytest apps/finance/tests/test_concurrency.py -v

# Coverage report
pytest apps/finance/tests/ --cov=apps.finance --cov-report=html

# Replay hypothesis failure
pytest apps/finance/tests/test_properties.py --hypothesis-seed=<seed>
```

### Expected Test Counts

| Category | Count | Examples |
|----------|-------|----------|
| Unit tests | 200+ | Validations, model methods |
| Integration tests | 300+ | Workflows, multi-model |
| Property tests | 50+ | 100 examples each |
| Stress tests | 15+ | Performance SLAs |
| Concurrency tests | 20+ | Thread safety |
| **Total** | **600+** | **50,000+ test assertions** |

---

## Sign-Off

QA Team: Ready for Phase 1 models  
Coverage Target: 95% minimum  
SLA Enforcement: GitHub Actions on every commit  
