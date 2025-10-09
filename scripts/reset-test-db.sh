#!/usr/bin/env bash
# Reset Test Database
# Resets database using Supabase CLI and re-seeds test data

set -e

echo "🔄 Resetting test database..."

# Check if Supabase is running
if ! supabase status > /dev/null 2>&1; then
    echo "❌ Error: Supabase is not running"
    echo "Start Supabase with: bun run test:setup"
    exit 1
fi

# Load environment variables
if [ -f .env.test ]; then
    export $(grep -v '^#' .env.test | xargs)
fi

# Reset database using Supabase CLI (reapplies migrations but skips seed)
echo "🗑️  Resetting database schema..."
supabase db reset --no-seed

# Re-seed test data
echo "🌱 Re-seeding test data..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < supabase/seed.sql > /dev/null 2>&1

echo "✅ Test database reset complete!"
echo ""
echo "💡 Tip: Run 'bun test' to verify tests still pass"
