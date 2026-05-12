# Development Guide

## Project Structure

```
accounting-system/
├── config/              # Django settings & routing
│   ├── settings.py     # Main Django configuration
│   ├── wsgi.py         # WSGI application
│   ├── asgi.py         # ASGI application (async support)
│   ├── urls.py         # Root URL routing
│   └── __init__.py
├── apps/                # Django applications
│   ├── core/           # Core functionality (auth, users, entities)
│   ├── finance/        # Financial logic (journal entries, accounts)
│   ├── localization/   # Per-jurisdiction modules
│   ├── integrations/   # External integrations (bank feeds, etc.)
│   └── __init__.py
├── templates/          # HTML templates (created on demand)
├── locale/             # Translation files (i18n)
├── media/              # User uploaded files (development)
├── staticfiles/        # Compiled static files (production)
├── manage.py           # Django management script
├── requirements.txt    # Python dependencies
├── .env.example        # Environment template
├── docker-compose.yml  # Local database & Redis
├── Dockerfile          # Production container
├── Makefile           # Development shortcuts
├── pytest.ini         # Test configuration
├── pyproject.toml     # Python project metadata
└── files/             # Project documentation

```

## Getting Started

### 1. Initial Setup

```bash
# Clone the repository (or navigate to existing one)
cd /Users/nachomini/ERP

# Run the setup script (macOS/Linux)
./setup.sh

# Or manual setup
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings
```

### 2. Database Setup

```bash
# Start PostgreSQL and Redis containers
docker compose up -d

# Run migrations
python manage.py migrate

# Create superuser for admin
python manage.py createsuperuser
```

### 3. Run Development Server

```bash
# Using Makefile
make run

# Or directly
python manage.py runserver
```

Visit http://localhost:8000/admin with your superuser credentials.

## Development Workflow

### Adding a New Django App Feature

1. **Create models** in `apps/<domain>/models.py`
   - Follow the invariants in CLAUDE.md
   - Use Decimal for money, include entity_id, add audit fields

2. **Create migrations**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

3. **Write tests** in `apps/<domain>/tests.py`
   - Use pytest + pytest-django
   - Use factory_boy for fixtures
   - Use hypothesis for property-based tests on money math

4. **Create views/serializers** in `apps/<domain>/views.py`

5. **Add URLs** in `apps/<domain>/urls.py`

6. **Test everything**
   ```bash
   make test  # Run all tests
   make lint  # Lint and type check
   make format  # Auto-format code
   ```

### Testing

```bash
# Run all tests
pytest

# Run specific test file
pytest apps/finance/tests.py

# Run with coverage
pytest --cov=apps

# Run specific marker
pytest -m unit  # Only unit tests
pytest -m integration  # Only integration tests
```

### Code Quality

```bash
# Lint with ruff
ruff check .

# Format with ruff
ruff format .

# Type check (strict on finance module)
mypy apps/finance --strict
```

### Database Management

```bash
# Create backup
docker compose exec postgres pg_dump -U postgres accounting_system > backup.sql

# Restore from backup
cat backup.sql | docker compose exec -T postgres psql -U postgres

# Access database shell
docker compose exec postgres psql -U postgres accounting_system

# Stop services
docker compose down
```

## Key Files to Read First

When starting work in an area:

1. **`files/accounting-system-starter/CLAUDE.md`** - Invariants and rules
2. **`files/accounting-system-starter/docs/data-model.md`** - Database schema
3. **`files/accounting-system-starter/docs/accounting-rules.md`** - Accounting rules
4. **`files/accounting-system-starter/docs/phase-0-decisions.md`** - Locked decisions
5. **`files/accounting-system-starter/docs/localization.md`** - Module architecture

## Common Tasks

### Adding a New Table

1. Create model with proper fields (entity_id, created_at, etc.)
2. Run `makemigrations` and review the migration
3. Run `migrate`
4. Add Django admin configuration if needed
5. Write tests

### Adding a New View/Endpoint

1. Create view function in `apps/<domain>/views.py`
2. Add URL pattern in `apps/<domain>/urls.py`
3. Include app URLs in `config/urls.py`
4. Add tests
5. Add to API documentation (if applicable)

### Adding a New Localization Rule

1. Create module in `apps/localization/<jurisdiction>/`
2. Implement required interfaces
3. Register in `apps/localization/registry.py`
4. Test with sample data
5. Document in `CLAUDE.md`

### Running Background Jobs

Django-Q2 handles async tasks:

```python
from django_q.tasks import async_task

# Queue a task
async_task('apps.finance.tasks.process_bank_reconciliation', entity_id=123)

# Monitor tasks
python manage.py qmonitor
```

## Debugging

### Enable Query Logging

```python
# In settings.py for development
LOGGING = {
    'version': 1,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'loggers': {
        'django.db.backends': {
            'handlers': ['console'],
            'level': 'DEBUG',
        },
    },
}
```

### Django Shell

```bash
python manage.py shell
```

### Inspect Database

```bash
# PostgreSQL CLI
docker compose exec postgres psql -U postgres accounting_system

# Common queries
\dt  # List tables
\d tablename  # Describe table
SELECT * FROM accounts LIMIT 5;
```

## Performance Monitoring

### Enable Django Debug Toolbar (development only)

```python
# In settings.py
INSTALLED_APPS += ['debug_toolbar']
MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']
INTERNAL_IPS = ['127.0.0.1']
```

### Monitor Background Jobs

```bash
python manage.py qmonitor
```

### Database Connection Pooling

Production uses pgBouncer (configured on host platform).

## Security Checklist

- [ ] `DEBUG = False` in production
- [ ] `SECRET_KEY` is unique and strong
- [ ] `ALLOWED_HOSTS` configured correctly
- [ ] Database password is strong
- [ ] SSL/TLS enabled in production
- [ ] CORS headers configured
- [ ] User input is validated and escaped
- [ ] Secrets are in environment variables, not code

## Deployment Checklist

Before deploying:

1. All tests pass: `make test`
2. Linting passes: `make lint`
3. No migrations pending: `python manage.py showmigrations`
4. Code is committed and pushed
5. Environment variables are set
6. Database is backed up
7. Runbook is updated

See DEPLOYMENT.md for platform-specific instructions.
