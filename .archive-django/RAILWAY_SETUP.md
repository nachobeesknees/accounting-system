# Railway Deployment (One Click)

## Quick Setup (2 minutes)

1. **Go to:** https://railway.app/new

2. **Click:** "Deploy from GitHub"

3. **Connect Your Account:** 
   - Select your GitHub account
   - Authorize Railway

4. **Select Repository:**
   - Find `nachobeesknees/accounting-system`
   - Click "Deploy Now"

That's it! Railway will:
- ✅ Build the Docker image
- ✅ Create PostgreSQL database automatically
- ✅ Set environment variables
- ✅ Deploy the app
- ✅ Give you a live URL in 2-3 minutes

## Default Environment Variables (Auto-Set)

Railway automatically creates a PostgreSQL database and sets:
- `DATABASE_URL` → auto-configured
- `PORT` → auto-assigned

## Access Your App

Once deployed, Railway gives you a URL like:
```
https://accounting-system-demo-production-xxxx.railway.app
```

Then visit:
- **Admin:** `https://[your-url]/admin/`
- **Demo Login:** `https://[your-url]/api/auth/demo-login/`

Login with: `demo_admin` / `demo123`

## If Demo Data Didn't Load

The app loads demo data on first startup. If it didn't:

1. Go to Railway dashboard
2. Click your project
3. Go to "Variables"
4. Add: `LOAD_DEMO_DATA = True`
5. Trigger a redeploy

## That's All!

No CLI needed. No manual configuration. Just GitHub → Railway → Live.
