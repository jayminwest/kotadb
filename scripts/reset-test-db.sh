#!/usr/bin/env bash
# Reset Test Database
# Resets database in Docker Compose stack and re-seeds test data

set -euo pipefail

echo "🔄 Resetting test database..."

# Read project name from .test-project-name file
if [ ! -f .test-project-name ]; then
    echo "❌ Error: .test-project-name file not found"
    echo "Have you run 'bun run test:setup' first?"
    exit 1
fi

PROJECT_NAME=$(cat .test-project-name)
echo "📝 Using project: $PROJECT_NAME"

# Check if containers are running
if ! docker compose -p "$PROJECT_NAME" ps | grep -q "Up"; then
    echo "❌ Error: Docker Compose stack is not running"
    echo "Start with: bun run test:setup"
    exit 1
fi

# Load environment variables
if [ -f .env.test ]; then
    export $(grep -v '^#' .env.test | xargs)
fi

# Drop and recreate database schema
echo "🗑️  Dropping all tables..."
docker compose -p "$PROJECT_NAME" exec -T db psql -U postgres -d postgres -c "
DO \$\$ DECLARE
    r RECORD;
BEGIN
    -- Drop all tables in public schema
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    -- Drop all tables in auth schema
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'auth') LOOP
        EXECUTE 'DROP TABLE IF EXISTS auth.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END \$\$;
" > /dev/null 2>&1

# Re-run migrations
echo "🔄 Re-applying migrations..."
./scripts/run-migrations-compose.sh "$PROJECT_NAME"

# Re-seed test data
echo "🌱 Re-seeding test data..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < supabase/seed.sql > /dev/null 2>&1

echo "✅ Test database reset complete!"
echo ""
echo "💡 Tip: Run 'bun test' to verify tests still pass"
