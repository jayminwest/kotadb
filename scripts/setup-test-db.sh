#!/usr/bin/env bash
# Setup Test Database
# Starts PostgreSQL test container, runs migrations, and seeds test data

set -e

echo "🚀 Setting up test database..."

# Load environment variables
if [ -f .env.test ]; then
    export $(grep -v '^#' .env.test | xargs)
fi

# Start PostgreSQL container (only test-db service, not adw_webhook which requires ADW_HOST_LOG_PATH)
echo "📦 Starting PostgreSQL container..."
ADW_HOST_LOG_PATH=/tmp docker compose up -d --no-deps test-db

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d kotadb_test -c "SELECT 1" > /dev/null 2>&1; then
        echo "✅ PostgreSQL is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ PostgreSQL failed to start within 30 seconds"
        exit 1
    fi
    sleep 1
done

# Run migrations in order
echo "🔄 Running migrations..."

# First create migrations table if it doesn't exist
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d kotadb_test -c "
CREATE TABLE IF NOT EXISTS migrations (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    applied_at timestamptz NOT NULL DEFAULT now()
);
" || true

# Run auth schema migration (test-only)
echo "  - Running 000_test_auth_schema..."
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d kotadb_test < src/db/migrations/000_test_auth_schema.sql > /dev/null 2>&1

# Run main schema migration (ignore GRANT errors for Supabase-specific roles)
echo "  - Running 001_initial_schema..."
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d kotadb_test < src/db/migrations/001_initial_schema.sql 2>&1 | grep -v "role.*does not exist" || true

# Seed test data
echo "🌱 Seeding test data..."
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d kotadb_test < supabase/seed.sql > /dev/null 2>&1

echo "✅ Test database setup complete!"
echo ""
echo "Test API Keys:"
echo "  Free tier:  kota_free_test1234567890ab_0123456789abcdef0123456789abcdef"
echo "  Solo tier:  kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef"
echo "  Team tier:  kota_team_team1234567890ab_0123456789abcdef0123456789abcdef"
echo ""
echo "Database connection: postgresql://postgres:postgres@localhost:5433/kotadb_test"
