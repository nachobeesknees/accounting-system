#!/bin/bash
# Usage: DATABASE_URL="postgres://..." bash scripts/export-db.sh
# Exports full schema + data to db-export.sql
pg_dump "$DATABASE_URL" \
  --no-owner --no-acl --clean --if-exists \
  --format=plain \
  -f db-export.sql
echo "Export complete: db-export.sql"
