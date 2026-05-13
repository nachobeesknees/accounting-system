# Fly.io Deployment Verification Guide

## Current Deployment Status

The app is being deployed to Fly.io with the following fixes:
1. ✅ Database configuration updated to support SQLite fallback
2. ✅ Migrations auto-generated in the entrypoint
3. ✅ UserEntityPermission import removed (model not yet implemented)
4. ✅ Demo data loader configured

GitHub Actions workflow is automatically deploying to: **https://accounting-system-demo.fly.dev**

## Step 1: Check GitHub Actions Deployment Status

Visit: https://github.com/nachobeesknees/accounting-system/actions

Look for the most recent workflow run (should say "Fix: Remove UserEntityPermission..."). Check if it:
- ✅ Shows green checkmark (completed successfully)
- ❌ Shows red X (failed)
- 🟡 Shows orange indicator (in progress)

## Step 2: Access the Application (Once Deployed)

Once deployment completes, the app will be available at:

**https://accounting-system-demo.fly.dev/**

You should see the Django admin interface or a demo login page.

## Step 3: Demo Account Login

Once the app is running, you can log in with these demo accounts:

| Role | Username | Password |
|------|----------|----------|
| Admin | demo_admin | demo123 |
| Accountant | demo_accountant | demo123 |
| CFO | demo_cfo | demo123 |
| Controller | demo_controller | demo123 |

Access the admin interface at:
**https://accounting-system-demo.fly.dev/admin/**

## Step 4: Verify Demo Data Was Loaded

Once logged in as demo_admin, check:

1. **Entities Created:**
   - Parent: "Demo Parent Company" (PARENT-001)
   - OPCO-USA: "Demo US Operations"
   - OPCO-EUR: "Demo EU Operations"
   - OPCO-GBP: "Demo UK Operations"
   - OPCO-AUS: "Demo Asia Operations"

2. **Accounts Created:**
   - Each entity should have 54 accounts in their chart of accounts
   - Total: ~270 accounts created

3. **Sample Transactions:**
   - 5 sample journal entries per entity (USD and EUR entities)
   - Total: 10 transactions with balanced entries

4. **Periods Created:**
   - 12 monthly periods (Jan-Dec 2026) per entity
   - Total: 60 periods

## Troubleshooting

### If you see 502 Bad Gateway:

1. **Wait 3-5 minutes** - Fly.io deployments can take time
2. **Check GitHub Actions** - Is the workflow still running? (orange indicator)
3. **Check if machines are running** - If you have access to fly CLI:
   ```bash
   fly status -a accounting-system-demo
   fly logs -a accounting-system-demo --tail 20
   ```

### If machines are "stopped":

The app might have crashed. Restart:
```bash
fly machines restart -a accounting-system-demo
```

### If you get a database error:

The app is configured to use SQLite (file-based database). This should work without any external setup. The database file is created at `/app/db.sqlite3` in the container.

### If demo data didn't load:

Check the logs:
```bash
fly logs -a accounting-system-demo --tail 50 | grep -i "demo\|error"
```

The load_demo_data command runs on startup if LOAD_DEMO_DATA=True is set (it is).

## What Was Fixed in This Deployment

1. **Database Configuration (`config/settings.py`)**
   - Added support for `DATABASE_URL` environment variable
   - Falls back to SQLite if no database is configured
   - No external database setup required

2. **Migrations (`Dockerfile`)**
   - Added `python manage.py makemigrations` to auto-generate missing migrations
   - This ensures all models are properly migrated to the database

3. **Demo Data Load (`load_demo_data.py`)**
   - Removed import of non-existent `UserEntityPermission` model
   - Demo data loading still works, just without entity permissions for now

4. **Environment Configuration (`fly.toml`)**
   - Set `DEBUG=False` for production
   - Set `ENVIRONMENT=production`
   - Set `ALLOWED_HOSTS=accounting-system-demo.fly.dev`
   - Set `LOAD_DEMO_DATA=True` to auto-load demo data on startup
   - Set `SECRET_KEY` to a demo value (should be changed for production)

## Next Steps After Verification

Once the app is running and you can log in:

1. ✅ Verify demo login works (demo_admin / demo123)
2. ✅ Verify demo entities are created
3. ✅ Verify demo accounts and transactions are loaded
4. 🔜 Build API Layer 2: Journal entry endpoints
5. 🔜 Build API Layer 3: Chart of Accounts management
6. 🔜 Build API Layer 4: FX rates & period management

## Database Persistence

⚠️ **Important:** The SQLite database file (`db.sqlite3`) is created inside the Docker container. When Fly.io machines restart, the database will be recreated and demo data will be reloaded (since LOAD_DEMO_DATA=True).

For production with persistent data:
- Set up a managed PostgreSQL database
- Set `DATABASE_URL` environment variable pointing to it
- Run migrations and seed data separately

## Support

If you encounter issues:
1. Check the GitHub Actions logs
2. Check Fly.io logs with `fly logs`
3. Restart machines with `fly machines restart`
4. Check the Dockerfile and entrypoint script are correct

---

**Deployment Details:**
- App: accounting-system-demo
- Region: ord (Chicago)
- Container: Python 3.12 slim
- Server: Gunicorn with 4 workers
- Status Endpoint: https://accounting-system-demo.fly.dev/ (should return Django response)
