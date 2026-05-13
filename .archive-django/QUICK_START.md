# Quick Start Guide

## 🚀 Deployment Status

**Latest Update (May 12, 2026):**
- Database configuration fixed (auto-fallback to SQLite)
- Auto-migrations enabled in Docker entrypoint
- Demo data loader fully functional

The app is being deployed to: **https://accounting-system-demo.fly.dev**

**Check deployment status:** https://github.com/nachobeesknees/accounting-system/actions

Once deployment completes (may take 2-5 minutes), proceed to step 2.

## 1️⃣ First Access

The application is at: **https://accounting-system-demo.fly.dev/**

If you see 502 error, the deployment is still in progress. Wait 1-2 minutes and refresh.

## 2️⃣ Single-Click Demo Login

**Visit:** `https://accounting-system-demo.fly.dev/api/auth/demo-login/`

You'll see 4 buttons. Click any to login instantly:

| Button | Role | Access |
|--------|------|--------|
| 👨‍💼 Admin | Full system | All entities, all operations |
| 📊 Accountant | Journal entries | Create/post entries, view GL |
| 💼 CFO | Reports | Consolidation, approval, reports |
| 🔐 Controller | Setup | Period locks, approval authority |

**That's it.** No password needed. Click → logged in → redirects to admin panel.

## 3️⃣ What You Get

### Pre-Loaded Data
- **5 Entities:** Parent company + 4 subsidiaries (USA, EU, UK, Asia)
- **Multi-Currency:** USD, EUR, GBP
- **Complete Setup:** 70 accounts per entity, 12 fiscal periods, 20+ sample transactions
- **Demo Users:** 4 accounts, all password: `demo123`

### Available URLs

| URL | Purpose |
|-----|---------|
| `/api/auth/demo-login/` | **← Click here to login** |
| `/admin/` | Admin panel (after login) |
| `/api/docs/` | Interactive API documentation |
| `/api/auth/health/` | System health check |

## 4️⃣ Test the System

### Quick Admin Panel Tour
1. Click 👨‍💼 **Admin** button on demo login page
2. Auto-redirects to `/admin/`
3. Navigate to **Finance** → **Journal Entries** to see sample data
4. Try creating a new entry

### Switch Demo Users
1. Go back to `/api/auth/demo-login/`
2. Click a different role (e.g., 📊 **Accountant**)
3. Auto-logs you in as that user
4. See restricted permissions

### Test API
```bash
# Get auth token
curl -X POST https://accounting-system-demo.fly.dev/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{
    "username":"demo_admin",
    "password":"demo123"
  }'

# Copy the token from response
# Query general ledger
curl -H "Authorization: Bearer <token>" \
  https://accounting-system-demo.fly.dev/api/finance/gl/
```

## 5️⃣ Demo Entities

All pre-loaded with sample data:

```
PARENT-001 (Demo Parent Company - USD)
├── OPCO-USA (US Operations - USD)
├── OPCO-EUR (EU Operations - EUR)  
├── OPCO-GBP (UK Operations - GBP)
└── OPCO-AUS (Asia Operations - USD)
```

Each entity has:
- 12 full fiscal year periods (Jan-Dec 2026)
- 70-account chart of accounts
- Opening balances, revenue, expense transactions
- Intercompany transactions ready for consolidation testing

## 6️⃣ Features Ready to Test

✅ **Double-Entry Bookkeeping** — Enforced at database level  
✅ **Multi-Currency** — USD, EUR, GBP with translation support  
✅ **Immutability** — Posted entries cannot be modified  
✅ **Audit Trail** — All changes logged  
✅ **Multi-Entity** — Permissions by role and entity  
✅ **Period Management** — Fiscal periods, locking, status  

## 7️⃣ Useful Commands

```bash
# View live logs
export PATH="/Users/nachomini/.fly/bin:$PATH"
flyctl logs --app=accounting-system-demo -f

# SSH into app
flyctl ssh console --app=accounting-system-demo
python manage.py shell

# Restart app
flyctl restart --app=accounting-system-demo

# View deployment status
flyctl status --app=accounting-system-demo
```

---

## That's it! 🎉

**Next:** Start with the demo login page and explore the admin panel.

Questions? Check:
- `/api/auth/health/` for system status
- `/api/docs/` for API details
- Logs: `flyctl logs --app=accounting-system-demo`
