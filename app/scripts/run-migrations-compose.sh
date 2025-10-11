#!/usr/bin/env bash
# Run Migrations for Docker Compose Test Stack
# Applies migrations from src/db/migrations/*.sql directly to containerized Postgres

set -euo pipefail

PROJECT_NAME="${1:-}"

if [ -z "$PROJECT_NAME" ]; then
    echo "❌ Error: PROJECT_NAME argument is required"
    echo "Usage: $0 <project-name>"
    exit 1
fi

echo "🔄 Running migrations for project: $PROJECT_NAME"

# Get database container port
DB_PORT=$(docker compose -p "$PROJECT_NAME" port db 5432 | cut -d: -f2)

if [ -z "$DB_PORT" ]; then
    echo "❌ Error: Could not determine database port"
    echo "Is the Docker Compose stack running?"
    exit 1
fi

echo "📡 Database port: $DB_PORT"

# Run each migration file in order
# Use app/supabase/migrations for the actual PostgreSQL migrations
# (app/src/db/migrations has the source, but may have old SQLite files or rollbacks)
MIGRATION_DIR="app/supabase/migrations"
MIGRATION_COUNT=0

if [ ! -d "$MIGRATION_DIR" ]; then
    echo "❌ Error: Migration directory not found: $MIGRATION_DIR"
    exit 1
fi

# Sort migrations by filename (lexicographic/timestamp order)
for migration in $(ls -1 "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
    MIGRATION_FILE=$(basename "$migration")

    # Skip rollback files (these are not forward migrations)
    if echo "$MIGRATION_FILE" | grep -qi "rollback"; then
        echo "  ⏭  Skipping $MIGRATION_FILE (rollback script)"
        continue
    fi

    echo "  ▶ Applying $MIGRATION_FILE..."

    # Run migration inside the container using docker exec
    docker compose -p "$PROJECT_NAME" exec -T db psql \
        -U postgres \
        -d postgres \
        -v ON_ERROR_STOP=1 \
        --quiet < "$migration"

    MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
done

if [ "$MIGRATION_COUNT" -eq 0 ]; then
    echo "⚠️  Warning: No migration files found in $MIGRATION_DIR"
else
    echo "✅ Applied $MIGRATION_COUNT migration(s) successfully"
fi
