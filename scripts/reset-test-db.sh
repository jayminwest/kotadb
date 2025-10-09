#!/usr/bin/env bash
# Reset Test Database
# Truncates all test tables and re-seeds data for a clean state

set -e

echo "🔄 Resetting test database..."

# Truncate tables in reverse dependency order
echo "🗑️  Truncating tables..."
PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d postgres << 'EOF'
-- Truncate in reverse dependency order to avoid FK violations
TRUNCATE TABLE dependencies CASCADE;
TRUNCATE TABLE "references" CASCADE;
TRUNCATE TABLE symbols CASCADE;
TRUNCATE TABLE indexed_files CASCADE;
TRUNCATE TABLE index_jobs CASCADE;
TRUNCATE TABLE repositories CASCADE;
TRUNCATE TABLE rate_limit_counters CASCADE;
TRUNCATE TABLE user_organizations CASCADE;
TRUNCATE TABLE api_keys CASCADE;
TRUNCATE TABLE organizations CASCADE;
TRUNCATE TABLE auth.users CASCADE;
EOF

# Re-seed test data
echo "🌱 Re-seeding test data..."
PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d postgres < supabase/seed.sql > /dev/null 2>&1

echo "✅ Test database reset complete!"
