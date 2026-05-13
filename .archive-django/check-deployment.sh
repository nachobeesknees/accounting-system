#!/bin/bash

echo "=========================================="
echo "Checking accounting-system-demo deployment"
echo "=========================================="
echo ""

# Check app health
echo "1. Checking if app is responding..."
RESPONSE=$(curl -s -m 5 -w "\n%{http_code}" https://accounting-system-demo.fly.dev/ 2>&1)
STATUS=$(echo "$RESPONSE" | tail -1)

if [ "$STATUS" = "200" ] || [ "$STATUS" = "302" ]; then
    echo "✅ App is responding! (HTTP $STATUS)"
elif [ "$STATUS" = "502" ]; then
    echo "❌ App returning 502 (Bad Gateway) - likely still starting or crashed"
elif [ "$STATUS" = "000" ]; then
    echo "❌ Connection failed - machines might be stopped or starting"
else
    echo "⚠️  Unexpected status: $STATUS"
fi

echo ""
echo "2. GitHub Actions deployment status:"
echo "   Visit: https://github.com/nachobeesknees/accounting-system/actions"
echo "   Look for 'Re-enable demo data loading' workflow"

echo ""
echo "3. Once app responds (HTTP 200), try:"
echo "   - Admin panel: https://accounting-system-demo.fly.dev/admin/"
echo "   - Demo login: https://accounting-system-demo.fly.dev/api/auth/demo-login/"

echo ""
echo "=========================================="
echo "If still seeing 502, wait 2-5 minutes"
echo "then run this script again"
echo "=========================================="
