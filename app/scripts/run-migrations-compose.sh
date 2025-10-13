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

# Detect execution context and set paths accordingly
# If running from app/ directory (local/worktree), use ../docker-compose.test.yml and supabase/migrations
# If running from repo root (CI), use docker-compose.test.yml and app/supabase/migrations
if [ -d "supabase/migrations" ]; then
    # Running from app/ directory
    COMPOSE_FILE="../docker-compose.test.yml"
    MIGRATION_DIR="supabase/migrations"
elif [ -d "app/supabase/migrations" ]; then
    # Running from repository root
    COMPOSE_FILE="docker-compose.test.yml"
    MIGRATION_DIR="app/supabase/migrations"
else
    echo "❌ Error: Cannot locate migration directory"
    echo "Tried: supabase/migrations (app/ context) and app/supabase/migrations (repo root context)"
    exit 1
fi

# Get database container port
DB_PORT=$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" port db 5432 | cut -d: -f2)

if [ -z "$DB_PORT" ]; then
    echo "❌ Error: Could not determine database port"
    echo "Is the Docker Compose stack running?"
    exit 1
fi

echo "📡 Database port: $DB_PORT"

# Run each migration file in order
MIGRATION_COUNT=0

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
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" exec -T db psql \
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
