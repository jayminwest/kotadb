#!/usr/bin/env bash
# Setup Test Database
# Starts Supabase Local (via Supabase CLI), runs migrations, and seeds test data

set -e

echo "🚀 Setting up Supabase Local test environment..."

# Check prerequisites
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI is not installed"
    echo "Install with: brew install supabase/tap/supabase (macOS)"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is not installed (required for .env.test generation)"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Start Docker Desktop or run: sudo systemctl start docker"
    exit 1
fi

# Start Supabase Local services (uses Docker under the hood)
echo "📦 Starting Supabase Local services (this may take a minute on first run)..."
supabase start

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 2

# Generate .env.test from Supabase status
echo "🔧 Generating .env.test from Supabase status..."
./scripts/generate-env-test.sh

# Load environment variables for seeding
if [ -f .env.test ]; then
    export $(grep -v '^#' .env.test | xargs)
fi

# Seed test data (migrations are auto-run by Supabase CLI)
echo "🌱 Seeding test data..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < supabase/seed.sql > /dev/null 2>&1

echo "✅ Supabase Local setup complete!"
echo ""
echo "Services (custom ports to avoid conflicts):"
echo "  PostgREST API:  http://localhost:54322"
echo "  Studio UI:      http://localhost:54328"
echo "  Database:       postgresql://postgres:postgres@localhost:5434/postgres"
echo ""
echo "Test API Keys:"
echo "  Free tier:  kota_free_test1234567890ab_0123456789abcdef0123456789abcdef"
echo "  Solo tier:  kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef"
echo "  Team tier:  kota_team_team1234567890ab_0123456789abcdef0123456789abcdef"
echo ""
echo "💡 Tip: Run 'bun run test:status' to check service status"
echo "💡 Tip: Run 'bun test' to run the test suite"
