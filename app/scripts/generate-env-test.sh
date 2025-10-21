#!/usr/bin/env bash
# Generate .env.test from Supabase CLI Status
# Extracts credentials from `supabase status --output json` to auto-generate test environment file

set -euo pipefail

echo "🔧 Generating .env.test from Supabase status..."

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is not installed"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed"
    echo "Install with: brew install supabase/tap/supabase (macOS)"
    exit 1
fi

# Check if Supabase is running by trying to get status
if ! supabase status --output json > /dev/null 2>&1; then
    echo "❌ Error: Supabase is not running"
    echo "Start Supabase with: supabase start"
    exit 1
fi

# Get Supabase status as JSON
STATUS_JSON=$(supabase status --output json)

# Extract values using jq
# Supabase CLI uses Kong gateway which wraps PostgREST
# We need to extract the API URL (Kong gateway) and keys
API_URL=$(echo "$STATUS_JSON" | jq -r '.api_url // "http://localhost:54321"')
ANON_KEY=$(echo "$STATUS_JSON" | jq -r '.anon_key // ""')
SERVICE_KEY=$(echo "$STATUS_JSON" | jq -r '.service_role_key // ""')
DB_URL=$(echo "$STATUS_JSON" | jq -r '.db_url // ""')

# Extract database components from connection string
# Format: postgresql://postgres:postgres@localhost:5434/postgres
if [ -n "$DB_URL" ]; then
    DB_HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo "$DB_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    DB_USER=$(echo "$DB_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    DB_PASSWORD=$(echo "$DB_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
else
    echo "⚠️  Warning: Could not extract database URL from Supabase status"
    DB_HOST="localhost"
    DB_PORT="5434"
    DB_NAME="postgres"
    DB_USER="postgres"
    DB_PASSWORD="postgres"
    DB_URL="postgresql://postgres:postgres@localhost:5434/postgres"
fi

# Validate required values
if [ -z "$ANON_KEY" ] || [ -z "$SERVICE_KEY" ]; then
    echo "❌ Error: Failed to extract API keys from Supabase status"
    exit 1
fi

# Generate .env.test file
cat > .env.test << EOF
# Test Environment Configuration
# Auto-generated from Supabase CLI status
# DO NOT commit this file - regenerate with: bun run test:env

# Supabase API URL (Kong gateway - provides /rest/v1/ routing to PostgREST)
SUPABASE_URL=$API_URL

# Supabase Keys (from Supabase Local)
SUPABASE_SERVICE_KEY=$SERVICE_KEY
SUPABASE_ANON_KEY=$ANON_KEY

# Direct PostgreSQL connection for migrations (bypasses PostgREST)
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DATABASE_URL=$DB_URL

# Supabase Native Postgres Connection (for pg-boss job queue)
SUPABASE_DB_URL=$DB_URL
EOF

echo "✅ Generated .env.test successfully!"
echo ""
echo "Configuration:"
echo "  API URL:     $API_URL"
echo "  Database:    $DB_URL"
echo ""
