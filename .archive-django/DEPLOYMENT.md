# Deployment Guide

This document describes how to deploy the accounting system to various platforms.

## Development Setup

```bash
./setup.sh
# or
make install
make db-up
make migrate
make run
```

## Production Deployment Options

### Option 1: Fly.io (Recommended for Django)

Fly.io is the best option for Django applications with integrated PostgreSQL support.

```bash
# Install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
flyctl launch  # Interactive setup
flyctl deploy
```

Fly.io handles:
- Automatic Docker builds and deployment
- PostgreSQL database provisioning
- Automatic SSL certificates
- Scaling and load balancing

### Option 2: Render.com

Render provides an easy deployment experience for Django.

```bash
# Push to GitHub
git push origin main

# Connect your GitHub repo to Render:
# 1. Go to https://dashboard.render.com
# 2. New+ > Web Service
# 3. Connect your GitHub repo
# 4. Use build command from render.yaml
# 5. Add environment variables
```

### Option 3: Vercel (Not Recommended for Full Django)

⚠️ **Note:** Vercel is optimized for serverless functions and doesn't work well with traditional Django applications. For this project, Fly.io or Render are better choices.

If you still want to use Vercel:
1. Connect your GitHub repo to Vercel
2. The `vercel.json` config will be picked up automatically
3. Set environment variables in Vercel dashboard

### Option 4: Railway

Railway provides a simple deployment platform for full-stack applications.

```bash
# Install Railway CLI
npm i -g @railway/cli

# Deploy
railway link  # Link to your GitHub repo
railway deploy
```

## Environment Variables

Set these in your deployment platform:

```
DEBUG=False
SECRET_KEY=<generate-a-secure-key>
ALLOWED_HOSTS=yourdomain.com
DATABASE_URL=<provided-by-platform>
REDIS_URL=<provided-by-platform>
SENTRY_DSN=<optional>
GOOGLE_OAUTH_CLIENT_ID=<optional>
GOOGLE_OAUTH_CLIENT_SECRET=<optional>
```

## Database

All platforms support PostgreSQL. Most provide managed databases:

- **Fly.io**: PostgreSQL add-on
- **Render**: PostgreSQL as a separate service
- **Railway**: PostgreSQL as a separate service
- **Vercel**: Use external PostgreSQL (Neon, Supabase, etc.)

## Running Migrations in Production

After deployment:

```bash
# Via platform CLI
fly ssh console
python manage.py migrate

# Or via Render/Railway dashboard console
python manage.py migrate
```

## Monitoring

Configure Sentry in your environment variables for error tracking:

1. Create a Sentry account at https://sentry.io
2. Create a new Django project
3. Copy the DSN and set `SENTRY_DSN` environment variable

## Scaling Considerations

- **Dyno/Instance Size**: Start with standard tier; upgrade if needed
- **Database**: Use managed database from your platform
- **Background Jobs**: Django-Q2 uses Redis; ensure platform supports it
- **Static Files**: WhiteNoise handles static file serving
- **Media Files**: Use Cloudflare R2 for persistent storage

## CI/CD Pipeline

GitHub Actions automatically runs tests on every push to main/develop:

- Tests run against PostgreSQL
- Linting checks are performed
- Failures block deployment

To deploy automatically after tests pass, configure your platform's GitHub integration.
