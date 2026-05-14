#!/bin/bash
# Usage: DATABASE_URL_EU="postgres://..." bash scripts/import-db.sh
# Imports db-export.sql into the EU database
psql "$DATABASE_URL_EU" -f db-export.sql
echo "Import complete"
