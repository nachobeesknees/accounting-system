# Django on Vercel Deployment Guide

## Prerequisites
- Vercel account (vercel.com)
- Your GitHub repository connected to Vercel
- PostgreSQL database (Vercel Postgres or external provider)

## Step 1: Connect Repository to Vercel
1. Go to https://vercel.com/import
2. Select "Import Git Repository"
3. Connect your GitHub account
4. Select `nachobeesknees/accounting-system`
5. Click "Import"

## Step 2: Configure Environment Variables in Vercel
In the Vercel project settings, add these environment variables:

### Required:
- `SECRET_KEY`: Set to a secure random string (run `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`)
- `DATABASE_URL`: Your PostgreSQL connection string (format: `postgresql://user:password@host:port/dbname`)
- `ALLOWED_HOSTS`: `your-app-name.vercel.app`
- `DEBUG`: `False`

### Optional:
- `LOAD_DEMO_DATA`: `True` (to load demo data on first run)

## Step 3: Deploy
1. Click "Deploy" in Vercel
2. Wait for build to complete
3. Check deployment logs if there are issues

## Step 4: Verify Deployment
Once deployed, test:
- `https://your-app-name.vercel.app/admin/` - Should show login page
- `https://your-app-name.vercel.app/api/auth/demo-login/` - Demo login endpoint

## Troubleshooting

### 502 Bad Gateway
- Check environment variables are set correctly
- Check DATABASE_URL is valid and database is accessible
- View deployment logs in Vercel dashboard

### Database Connection Errors
- Verify DATABASE_URL format: `postgresql://user:password@host:port/dbname`
- Ensure database allows connections from Vercel's IP ranges
- Test connection string locally

### Static Files Not Loading
- Vercel should handle this automatically with WhiteNoise
- Check `STATIC_ROOT` and `STATIC_URL` in Django settings

## Files Added for Vercel
- `vercel.json` - Vercel configuration
- `build.sh` - Build script that runs migrations and collects static files

## Notes
- Vercel has a 30-second timeout for serverless functions
- For longer-running tasks, consider using Vercel Cron Jobs
- Database connections should use connection pooling for best performance
