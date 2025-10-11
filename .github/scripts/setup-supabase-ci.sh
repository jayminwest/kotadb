#!/usr/bin/env bash
# Setup Supabase Local for CI Environment
# Starts Supabase Local services and generates .env.test for GitHub Actions
#
# Expected Supabase CLI output format (current):
#   API_URL, SECRET_KEY, PUBLISHABLE_KEY, SERVICE_ROLE_KEY, DB_URL, etc.
# Previous format (pre-v2.x):
#   api_url, anon_key, service_role_key, db_url, etc.
# This script handles both formats with fallback logic.

set -euo pipefail

echo "🚀 Setting up Supabase Local for CI environment..."

# Check prerequisites
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is not installed (required for .env.test generation)"
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    exit 1
fi

# Initialize Supabase config if not present
if [ ! -f "supabase/config.toml" ]; then
    echo "📋 Initializing Supabase configuration..."
    supabase init
fi

# Start Supabase Local services
echo "📦 Starting Supabase Local services..."
supabase start

# Wait for services to be fully ready
echo "⏳ Waiting for services to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if supabase status --output json > /dev/null 2>&1; then
        echo "✅ Supabase services are ready!"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "❌ Error: Supabase services failed to start within timeout"
        supabase status
        exit 1
    fi

    echo "Waiting for services... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

# Generate .env.test from Supabase status
echo "🔧 Generating .env.test from Supabase status..."

# Get Supabase status as JSON
STATUS_JSON=$(supabase status --output json)

# Extract values using jq with fallbacks for both old and new field name formats
# New CLI format uses uppercase keys (API_URL, SECRET_KEY, PUBLISHABLE_KEY, SERVICE_ROLE_KEY)
# Old CLI format used lowercase keys (api_url, anon_key, service_role_key)
API_URL=$(echo "$STATUS_JSON" | jq -r '.API_URL // .api_url // "http://localhost:54321"')
ANON_KEY=$(echo "$STATUS_JSON" | jq -r '.SECRET_KEY // .ANON_KEY // .anon_key // ""')
SERVICE_KEY=$(echo "$STATUS_JSON" | jq -r '.SERVICE_ROLE_KEY // .service_role_key // ""')
DB_URL=$(echo "$STATUS_JSON" | jq -r '.DB_URL // .db_url // ""')

# Validate required values
if [ -z "$ANON_KEY" ] || [ -z "$SERVICE_KEY" ]; then
    echo "❌ Error: Failed to extract API keys from Supabase status"
    echo "Status JSON:"
    echo "$STATUS_JSON"
    echo ""
    echo "Attempted to extract:"
    echo "  ANON_KEY: Tried SECRET_KEY, ANON_KEY, anon_key"
    echo "  SERVICE_KEY: Tried SERVICE_ROLE_KEY, service_role_key"
    exit 1
fi

# Extract database components from connection string
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

# Generate .env.test file
cat > .env.test << EOF
# Test Environment Configuration (CI)
# Auto-generated from Supabase CLI status in GitHub Actions
# DO NOT commit this file

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
EOF

echo "✅ Generated .env.test successfully!"
echo ""
echo "Configuration:"
echo "  API URL:     $API_URL"
echo "  Database:    $DB_URL"
echo ""

# Seed test data if seed file exists
if [ -f "supabase/seed.sql" ]; then
    echo "🌱 Seeding test data..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < supabase/seed.sql > /dev/null 2>&1 || {
        echo "⚠️  Warning: Seeding failed, continuing anyway..."
    }
    echo "✅ Test data seeded successfully!"
fi

echo ""
echo "🎉 Supabase Local setup complete for CI!"
