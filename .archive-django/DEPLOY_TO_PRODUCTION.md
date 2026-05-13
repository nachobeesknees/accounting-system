# Production Deployment Guide

## Platform Comparison

| Platform | Django Support | Database | Ideal For | Cost |
|----------|---|----------|----------|------|
| **Fly.io** (Recommended) | ✅ Excellent | Included | Django apps, persistent workloads | $5-50/mo |
| **Railway** | ✅ Excellent | Included | Rapid Django deployment | $5-50/mo |
| **Render.com** | ✅ Good | Separate service | Managed experience | $7-70/mo |
| Vercel | ⚠️ Limited | External required | Serverless, static, Edge | $20-100/mo |
| Heroku | ✅ Good | Included | Classic Django | $50-500/mo |

**Recommendation:** Use **Fly.io** (primary) or **Railway** (easier). Vercel works but isn't optimized for Django.

---

## Option 1: Fly.io Deployment (Recommended) ⭐

### Prerequisites
```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Verify
flyctl version
```

### Deploy

```bash
# From project root
cd /Users/nachomini/ERP

# Launch (creates app on Fly.io)
flyctl launch

# When prompted:
# - App name: accounting-system
# - Region: ord (or nearest to you)
# - Set environment variables: Yes

# Set required secrets
flyctl secrets set SECRET_KEY="$(openssl rand -base64 32)"
flyctl secrets set DATABASE_URL="postgresql://..."  # Fly provides this
flyctl secrets set ALLOWED_HOSTS="accounting-system.fly.dev"

# Deploy
flyctl deploy

# Watch deployment
flyctl logs

# Access
open https://accounting-system.fly.dev
```

### What Gets Deployed

✅ Docker container with:
- Django app (gunicorn)
- PostgreSQL database (in-memory for demo, can add persistent volume)
- Redis (for background jobs)
- Static files (collectstatic)
- Demo data (loaded automatically)

✅ Demo Access:
```
URL: https://accounting-system.fly.dev
Admin: /admin
API: /api/

Demo Accounts (all password: demo123):
- demo_admin (full access)
- demo_accountant (read/write entries)
- demo_cfo (reports + approval)
- demo_controller (setup + approval)
```

---

## Option 2: Railway Deployment (Easier)

### Deploy in 30 Seconds

```bash
# Install Railway
npm i -g @railway/cli

# Login
railway login

# Deploy
cd /Users/nachomini/ERP
railway up

# Watch
railway logs -f

# Get URL
railway open
```

Railway auto-detects Django and:
- Provisions PostgreSQL
- Handles migrations
- Loads demo data
- Assigns public URL

**Result:** https://`random-slug`.railway.app

---

## Option 3: Vercel (Not Recommended for Django)

### Why Not Vercel?
- Vercel is **serverless** (runs functions, not persistent processes)
- Django needs **persistent workers** (gunicorn stays running)
- Connections timeout after 30-60 seconds
- Database connections need pooling (complex)
- Not cost-effective for always-on apps

### If You Must Use Vercel

**Vercel can run Django if:**
1. You externalize database (Neon, Supabase, Planetscale)
2. You externalize Redis (Upstash)
3. You accept 30s function timeout (limits features)
4. You use `serverless-http` middleware (adds latency)

**Not recommended.** Use Fly.io or Railway instead.

---

## Quick Start: Fly.io

### Full Deploy in 5 Minutes

```bash
# 1. Install Fly CLI
curl -L https://fly.io/install.sh | sh && flyctl auth login

# 2. From project directory
cd /Users/nachomini/ERP

# 3. Create app on Fly.io
flyctl launch --name accounting-system-demo --region ord

# 4. Deploy
flyctl deploy --local-only

# 5. Watch logs
flyctl logs

# 6. Open in browser
open https://accounting-system-demo.fly.dev/api/auth/health/
```

### Verify Deployment

```bash
# Health check
curl https://accounting-system-demo.fly.dev/api/auth/health/

# Response (if successful):
{
  "status": "healthy",
  "database": "connected",
  "entities": 5,
  "triggers": 7,
  "invariants": "enforced"
}

# Admin login
# Visit: https://accounting-system-demo.fly.dev/admin
# Username: demo_admin
# Password: demo123
```

---

## Demo Data Included

### Entities (5 Total)
```
PARENT-001: Demo Parent Company (USD)
├── OPCO-USA: US Operations (USD)
├── OPCO-EUR: EU Operations (EUR)
├── OPCO-GBP: UK Operations (GBP)
└── OPCO-AUS: Asia Operations (USD)
```

### Demo Accounts (4 Users)

| Username | Password | Role | Permissions |
|----------|----------|------|-------------|
| `demo_admin` | demo123 | Admin | All entities, all operations |
| `demo_accountant` | demo123 | Accountant | Create/post entries, view GL |
| `demo_cfo` | demo123 | CFO | Reports, consolidation, approval |
| `demo_controller` | demo123 | Controller | Setup, approval, period locks |

### Sample Data
- **5 entities** with multi-currency (USD, EUR, GBP)
- **12 periods** per entity (full 2026 calendar)
- **70 accounts** per entity (complete CoA)
- **20+ sample transactions** (opening balances, revenue, expenses)
- **Intercompany transactions** (ready for consolidation testing)

---

## Post-Deployment

### Run Migrations
```bash
# Fly.io
flyctl ssh console
python manage.py migrate

# Railway
railway shell
python manage.py migrate
```

### Load Additional Demo Data
```bash
# If not auto-loaded, run manually
python manage.py load_demo_data

# Clear and reload
python manage.py load_demo_data --clear
```

### Test APIs
```bash
# Health check
curl https://your-app.fly.dev/api/auth/health/

# Get GL entries (requires auth)
curl -H "Authorization: Bearer <token>" \
  https://your-app.fly.dev/api/finance/gl/

# Admin interface
open https://your-app.fly.dev/admin/
```

---

## Environment Variables

### Required
```
SECRET_KEY=<generate-with-openssl>
DEBUG=False
ENVIRONMENT=production
ALLOWED_HOSTS=your-app.fly.dev
```

### Optional
```
LOAD_DEMO_DATA=True  # Auto-load demo data on startup
SENTRY_DSN=<optional-error-tracking>
LOG_LEVEL=INFO
```

---

## Monitoring

### Fly.io
```bash
# View logs
flyctl logs

# Monitor app
flyctl status

# Check database
flyctl ssh console
psql $DATABASE_URL
\dt  # List tables
SELECT COUNT(*) FROM finance_journalentry;
```

### Health Dashboard
```
https://your-app.fly.dev/api/auth/health/
```

Returns:
```json
{
  "status": "healthy",
  "database": "connected",
  "entities": 5,
  "triggers": 7,
  "invariants": "enforced"
}
```

---

## Scaling

### Fly.io Auto-Scaling
```bash
# Enable auto-scaling
flyctl scale count web=2-4 --memory 2048

# Monitor instances
flyctl monitor
```

### Database
- Fly.io: PostgreSQL cluster (3 regions)
- Backup: Built-in (7 daily, 4 weekly, 12 monthly)
- Restore: Point-in-time recovery available

---

## Rollback

```bash
# View deployments
flyctl deployments list

# Rollback to previous
flyctl deployments rollback

# Or specific version
flyctl deploy --image-label v1.2.3
```

---

## Cost Estimate

### Fly.io
```
App: $5/mo (includes 3 shared CPU instances)
Database (PostgreSQL): $15/mo
Redis: $0-10/mo
Total: ~$20-30/mo
```

### Railway
```
Compute: ~$5-10/mo
Database (PostgreSQL): ~$15/mo
Total: ~$20-25/mo
```

### Vercel (if used)
```
Vercel Pro: $20/mo
External Database: $15-30/mo
External Redis: $5-10/mo
Total: ~$40-60/mo (not recommended)
```

---

## Troubleshooting

### Database Connection Error
```bash
# Check DATABASE_URL
flyctl secrets list

# Verify database is running
flyctl ssh console
psql -c "SELECT 1"

# Restart database
flyctl ssh console
sudo systemctl restart postgres
```

### Demo Data Not Loading
```bash
# Manual load
flyctl ssh console
python manage.py load_demo_data

# Verify
python manage.py shell << EOF
from apps.core.models import Entity
print(f"Entities: {Entity.objects.count()}")
EOF
```

### Migration Errors
```bash
# Check migration status
flyctl ssh console
python manage.py showmigrations

# Re-run migrations
python manage.py migrate --no-input
```

---

## Next Steps

1. **Deploy to Fly.io** (recommended)
   ```bash
   flyctl launch --name accounting-system-demo
   flyctl deploy
   ```

2. **Test Demo Data**
   - Visit https://your-app.fly.dev/admin
   - Login: demo_admin / demo123
   - Explore 5 entities with sample data

3. **Run Phase 6 API Tests**
   - Test journal entry creation
   - Verify double-entry constraint
   - Test GL queries

4. **Continue Deployments**
   - Each day: New features deployed
   - Auto-load updated demo data
   - Database persists across deployments

---

## Support

**Fly.io:**
- Docs: https://fly.io/docs/django/
- Support: https://fly.io/help/

**Railway:**
- Docs: https://docs.railway.app/
- Support: https://discord.gg/railway

**Questions:**
- Check database with `flyctl ssh console`
- View logs with `flyctl logs`
- Restart with `flyctl restart`
