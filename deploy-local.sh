#!/bin/bash
set -e

echo "🚀 Phase 6 Deployment 1: Database Setup & Triggers"
echo "=================================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Ensure databases are running
echo -e "${YELLOW}1. Starting Postgres & Redis...${NC}"
docker compose up -d || true
sleep 3

# 2. Apply migrations
echo -e "${YELLOW}2. Applying migrations...${NC}"
python manage.py migrate

# 3. Create triggers
echo -e "${YELLOW}3. Creating Postgres triggers for invariants...${NC}"
python manage.py create_triggers

# 4. Load test data
echo -e "${YELLOW}4. Loading test fixtures...${NC}"
python manage.py shell << EOF
from apps.core.models import Entity, User
from apps.finance.models import Account, Period
from datetime import datetime, date
from decimal import Decimal

# Create test entity
entity, _ = Entity.objects.get_or_create(
    code='TEST-001',
    defaults={
        'name': 'Test Entity',
        'entity_type': 'opco',
        'functional_currency': 'USD',
        'fiscal_year_start': 1,
        'created_by_id': None,
    }
)
print(f"✓ Entity: {entity.code}")

# Create test periods
for month in range(1, 4):
    period, _ = Period.objects.get_or_create(
        entity=entity,
        period_type='month',
        period_number=month,
        fiscal_year=2026,
        defaults={
            'start_date': date(2026, month, 1),
            'end_date': date(2026, month + 1, 1) if month < 12 else date(2027, 1, 1),
            'status': 'open',
            'created_by_id': None,
        }
    )
    print(f"✓ Period: {period.fiscal_year}-{period.period_number}")

# Create test accounts
account_data = [
    {'code': '1000', 'name': 'Cash', 'account_type': 'asset'},
    {'code': '1200', 'name': 'Accounts Receivable', 'account_type': 'asset'},
    {'code': '2000', 'name': 'Accounts Payable', 'account_type': 'liability'},
    {'code': '3000', 'name': 'Retained Earnings', 'account_type': 'equity'},
    {'code': '4000', 'name': 'Revenue', 'account_type': 'revenue'},
]

for acc in account_data:
    account, _ = Account.objects.get_or_create(
        entity=entity,
        code=acc['code'],
        defaults={
            'name': acc['name'],
            'account_type': acc['account_type'],
            'currency': 'USD',
            'is_active': True,
            'postable': True,
            'created_by_id': None,
        }
    )
    print(f"✓ Account: {account.code} - {account.name}")

print("\n✅ Test data loaded successfully")
EOF

# 5. Run health check
echo -e "${YELLOW}5. Testing database connections...${NC}"
python manage.py shell << EOF
from django.db import connection
from apps.core.models import Entity

# Test query
entity_count = Entity.objects.count()
print(f"✓ Entity count: {entity_count}")

# Test connection
with connection.cursor() as cursor:
    cursor.execute("SELECT version();")
    version = cursor.fetchone()[0]
    print(f"✓ Postgres: {version[:60]}...")

print("\n✅ Database health check passed")
EOF

# 6. Summary
echo ""
echo -e "${GREEN}=================================================="
echo "✅ DEPLOYMENT 1 COMPLETE"
echo "=================================================="
echo ""
echo "Database Status:"
echo "  - Migrations: Applied ✓"
echo "  - Triggers: Created ✓"
echo "  - Test Data: Loaded ✓"
echo ""
echo "Next steps:"
echo "  1. Run tests: pytest apps/finance/tests/ -v"
echo "  2. Start server: python manage.py runserver"
echo "  3. Access health: curl http://localhost:8000/api/auth/health/"
echo ""
