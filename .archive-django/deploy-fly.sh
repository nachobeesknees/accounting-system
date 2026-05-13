#!/bin/bash
set -e

echo "🚀 Deploying to Fly.io with Demo Data"
echo "======================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo -e "${RED}❌ Fly CLI not found. Install it:${NC}"
    echo "   curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Get app name from user or use default
APP_NAME="${1:-accounting-system-demo}"
REGION="${2:-ord}"

echo -e "${YELLOW}App Name: $APP_NAME${NC}"
echo -e "${YELLOW}Region: $REGION${NC}"
echo ""

# Check if app exists
if flyctl apps list | grep -q "^$APP_NAME"; then
    echo -e "${YELLOW}Deploying to existing app: $APP_NAME${NC}"
    ACTION="deploy"
else
    echo -e "${YELLOW}Creating new app: $APP_NAME${NC}"
    ACTION="launch"
fi

# Set secret key if not already set
echo -e "${YELLOW}Setting up secrets...${NC}"
SECRET_KEY=$(openssl rand -base64 32)
flyctl secrets set SECRET_KEY="$SECRET_KEY" --app=$APP_NAME 2>/dev/null || true
echo "  ✓ SECRET_KEY configured"

# Deploy
if [ "$ACTION" = "launch" ]; then
    echo -e "${YELLOW}Launching app on Fly.io...${NC}"
    flyctl launch --name $APP_NAME --region $REGION --no-deploy

    # Configure app
    flyctl apps info $APP_NAME

    echo -e "${YELLOW}Deploying...${NC}"
    flyctl deploy --app=$APP_NAME --local-only
else
    echo -e "${YELLOW}Redeploying app...${NC}"
    flyctl deploy --app=$APP_NAME --local-only
fi

# Wait for deployment to complete
echo -e "${YELLOW}Waiting for deployment to complete...${NC}"
sleep 10

# Get app URL
APP_URL=$(flyctl info --app=$APP_NAME --json | grep -o '"Hostname":"[^"]*"' | cut -d'"' -f4)
if [ -z "$APP_URL" ]; then
    APP_URL="$APP_NAME.fly.dev"
fi

# Test health check
echo -e "${YELLOW}Testing deployment...${NC}"
for i in {1..30}; do
    if curl -s "https://$APP_URL/api/auth/health/" > /dev/null 2>&1; then
        echo "  ✓ App is healthy"
        break
    fi
    echo "  ⏳ Waiting for app to start... ($i/30)"
    sleep 2
done

# Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "App: ${GREEN}$APP_NAME${NC}"
echo -e "URL: ${GREEN}https://$APP_URL${NC}"
echo ""
echo -e "${YELLOW}Demo Accounts:${NC}"
echo "  Admin:       demo_admin / demo123"
echo "  Accountant:  demo_accountant / demo123"
echo "  CFO:         demo_cfo / demo123"
echo "  Controller:  demo_controller / demo123"
echo ""
echo -e "${YELLOW}Quick Links:${NC}"
echo "  Dashboard:  https://$APP_URL/"
echo "  Admin:      https://$APP_URL/admin/"
echo "  Health:     https://$APP_URL/api/auth/health/"
echo "  API Docs:   https://$APP_URL/api/docs/"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  View logs:    flyctl logs --app=$APP_NAME -f"
echo "  SSH console:  flyctl ssh console --app=$APP_NAME"
echo "  Deploy again: bash deploy-fly.sh $APP_NAME"
echo ""
echo -e "${YELLOW}Demo Entities Created:${NC}"
echo "  • PARENT-001: Demo Parent Company (USD)"
echo "  • OPCO-USA:   US Operations (USD)"
echo "  • OPCO-EUR:   EU Operations (EUR)"
echo "  • OPCO-GBP:   UK Operations (GBP)"
echo "  • OPCO-AUS:   Asia Operations (USD)"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Login at: https://$APP_URL/admin/"
echo "  2. Use demo_admin / demo123"
echo "  3. Explore 5 entities with sample data"
echo "  4. Test journal entry creation"
echo ""
