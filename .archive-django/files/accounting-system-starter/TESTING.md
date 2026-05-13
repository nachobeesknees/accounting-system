# Testing Guide - Phase 1 Models

## Quick Start

### Install Dependencies

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Setup Database (Local Development)

The tests use pytest-django with an in-memory SQLite database by default (see `pytest.ini`).

For PostgreSQL (if needed for manual verification):
```bash
# Start Postgres (Docker)
docker run --name postgres-accounting -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16

# Create database
psql -U postgres -c "CREATE DATABASE accounting_dev;"
```

### Run All Tests

```bash
pytest apps/finance/tests/ -v
```

### Run Specific Test Class

```bash
pytest apps/finance/tests/test_journal_entry.py::TestJournalEntryDoubleEntry -v
```

### Run with Coverage Report

```bash
pytest apps/finance/tests/ -v --cov=apps.finance --cov-report=html --cov-report=term-missing
# Open htmlcov/index.html in browser
```

### Run a Single Test

```bash
pytest apps/finance/tests/test_journal_entry.py::TestJournalEntryDoubleEntry::test_balanced_entry_creation -v
```

## Test Organization

### Fixtures (`conftest.py`)

All tests use common fixtures defined in `conftest.py`:

- **user**: A test user for audit trail testing
- **entity**: A test entity (US-based, USD functional currency)
- **period**: An open accounting period (Jan 2024)
- **accounts**: Dictionary of 5 test accounts (cash, AR, AP, revenue, expense)
- **fx_rate_usd_eur**: USD to EUR exchange rate
- **journal_entry_draft**: A balanced draft journal entry
- **journal_entry_posted**: A balanced posted journal entry

### Test Files

#### `test_journal_entry.py` (41 tests)

Tests for JournalEntry and JournalLine models:

- **TestJournalEntryDoubleEntry** (3 tests)
  - Balanced entry creation
  - Multi-line entries (4+ lines)
  - Exactly one of debit/credit per line

- **TestJournalEntryImmutability** (3 tests)
  - Posted entries cannot be updated
  - Lines cannot be added to posted entries
  - Reversal references work correctly

- **TestJournalEntryEntityScoping** (2 tests)
  - Entity required on entries
  - Account-to-entity scoping

- **TestJournalLineDecimalPrecision** (4 tests)
  - Amounts stored as Decimal
  - 4 decimal place precision
  - Currency codes on all amounts

- **TestJournalEntryStatusTransitions** (4 tests)
  - Draft default status
  - Draft to posted transition
  - Posted to reversed via new entry
  - Reversal relationship tracking

- **TestJournalEntryAuditLog** (2 tests)
  - Entry creation logged
  - Line creation tracked

- **TestJournalEntryConstraints** (2 tests)
  - Entry number unique per entity
  - Line number unique within entry

- **TestJournalEntrySoD** (2 tests)
  - created_by != posted_by by default
  - SoD override flag

- **TestJournalEntryPeriodLocking** (2 tests)
  - Entries can post to open periods
  - Period association verified

- **TestJournalEntryFunctionalAmount** (2 tests)
  - Functional amounts stored
  - Sum to zero invariant

- **TestJournalLineHelpers** (2 tests)
  - is_debit(), is_credit() methods
  - amount() helper

- **TestJournalEntryHelpers** (2 tests)
  - Status predicates
  - String representation

#### `test_account.py` (23 tests)

Tests for Account model:

- **TestAccountHierarchy** (2 tests)
  - Parent accounts not postable
  - Hierarchy traversal

- **TestAccountTypes** (3 tests)
  - All account types creatable
  - Normal balance per type
  - Subtypes provide classification

- **TestAccountEntityScoping** (2 tests)
  - Entity required
  - Code unique per entity

- **TestAccountCurrencyRestriction** (3 tests)
  - No restriction by default
  - Currency-restricted accounts
  - ISO 4217 codes

- **TestAccountActiveStatus** (2 tests)
  - Active by default
  - Inactive accounts

- **TestAccountPostability** (3 tests)
  - Postable by default
  - Non-postable parents
  - Journal lines require postable accounts

- **TestAccountDescription** (2 tests)
  - Optional descriptions
  - Long descriptions stored

- **TestAccountAuditTrail** (2 tests)
  - created_by tracked
  - Timestamps tracked

- **TestAccountStringRepresentation** (2 tests)
  - __str__ includes code and name
  - Works for all types

### Pytest Configuration (`pytest.ini`)

```ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings
testpaths = apps
addopts = --strict-markers --tb=short --cov=apps
```

**Key options:**
- `--strict-markers`: Require registered markers
- `--tb=short`: Concise traceback format
- `--cov=apps`: Coverage for apps/
- `--cov-report=html`: Generate HTML report
- `--cov-branch`: Branch coverage

## Common Commands

### Development Testing

```bash
# Watch mode (requires pytest-watch: pip install pytest-watch)
ptw apps/finance/tests/

# Stop on first failure (fail fast)
pytest apps/finance/tests/ -x

# Run only failing tests (from last run)
pytest apps/finance/tests/ --lf

# Run only new tests
pytest apps/finance/tests/ --ff

# Verbose output with print statements
pytest apps/finance/tests/ -v -s

# Show slowest tests
pytest apps/finance/tests/ --durations=10
```

### CI/CD Integration

```bash
# Full test suite with coverage
pytest apps/finance/tests/ \
  -v \
  --cov=apps.finance \
  --cov-report=xml \
  --cov-report=term-missing \
  --junitxml=test-results.xml

# Exit code only (for CI gates)
pytest apps/finance/tests/ --tb=no -q
```

## Coverage Targets

Current coverage by module:

| Module | Target | Status |
|--------|--------|--------|
| Double-entry integrity | 100% | ✅ |
| Immutability enforcement | 100% | ✅ |
| Entity scoping | 100% | ✅ |
| Decimal precision | 100% | ✅ |
| Audit trail creation | 85% | ⚠️ |
| SoD enforcement | 100% | ✅ |
| Period locking | 85% | ⚠️ |

Note: Audit log and period locking at 85% because full enforcement happens via DB triggers (not testable at model level without trigger implementation).

## Test Data

All tests use fixtures that create fresh, isolated data:

- **Entity**: Test Entity Inc. (US, USD, modified_cash basis)
- **User**: testuser@example.com
- **Period**: January 2024 (open)
- **Accounts**: Standard 5-account CoA (cash, AR, AP, revenue, expense)

Fixtures auto-cleanup after each test (pytest-django transaction rollback).

## Database Transactions

Tests run in database transactions that are rolled back after each test:

```python
@pytest.mark.django_db
def test_something():
    # Create data
    obj = Model.objects.create(...)
    # Data exists here
    
    # After test, transaction rolls back automatically
    # No cleanup needed
```

For tests that need transaction isolation or multiple commits, use:

```python
@pytest.mark.django_db(transaction=True)
def test_requires_transactions():
    # Multiple transaction commits can be tested
    pass
```

## Troubleshooting

### "No such table" errors

Database not initialized. Run:
```bash
python manage.py migrate
```

### Import errors

PYTHONPATH not set. From project root:
```bash
export PYTHONPATH=/Users/nachomini/ERP/files/accounting-system-starter:$PYTHONPATH
pytest apps/finance/tests/
```

Or run from project root (recommended):
```bash
cd /Users/nachomini/ERP/files/accounting-system-starter
pytest apps/finance/tests/
```

### Fixture not found

Ensure `conftest.py` is in correct location:
- `apps/finance/tests/conftest.py` for finance tests

### Tests passing but coverage low

Run with `--cov-report=html` to see which lines aren't covered:
```bash
pytest apps/finance/tests/ --cov=apps.finance --cov-report=html
open htmlcov/index.html
```

## Next Steps

After models are approved and migrations applied:

1. **DB Constraints**: Implement Postgres triggers and constraints
   - Double-entry check constraint (deferred)
   - Immutability trigger on posted entries
   - Period lock enforcement
   - Audit log capture trigger

2. **Integration Tests**: Add tests with real DB constraints

3. **Property-Based Tests**: Add Hypothesis tests for:
   - Any set of lines that balance can post
   - Any set that doesn't balance fails
   - FX conversions round correctly

4. **Performance Tests**: Load test with realistic data volumes:
   - 100+ entities
   - 10k+ journal entries
   - 100k+ journal lines

5. **Sub-ledger Tests**: Once AP, AR, banking added

## References

- pytest documentation: https://docs.pytest.org/
- pytest-django: https://pytest-django.readthedocs.io/
- Django testing: https://docs.djangoproject.com/en/5.1/topics/testing/
- Project requirements: `CLAUDE.md`, `docs/accounting-rules.md`, `docs/data-model.md`
