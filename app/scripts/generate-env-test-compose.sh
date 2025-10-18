#!/usr/bin/env bash
# Generate .env.test from Docker Compose containers
# Extracts credentials from running containers to auto-generate test environment file

set -euo pipefail

PROJECT_NAME="${1:-}"

if [ -z "$PROJECT_NAME" ]; then
    echo "❌ Error: PROJECT_NAME argument is required"
    echo "Usage: $0 <project-name>"
    exit 1
fi

echo "🔧 Generating .env.test from Docker Compose containers..."

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed or not running"
    exit 1
fi

# Detect execution context and set compose file path
# If running from app/ directory (local/worktree), use ../docker-compose.test.yml
# If running from repo root (CI), use docker-compose.test.yml
if [ -f "../docker-compose.test.yml" ]; then
    # Running from app/ directory
    COMPOSE_FILE="../docker-compose.test.yml"
elif [ -f "docker-compose.test.yml" ]; then
    # Running from repository root
    COMPOSE_FILE="docker-compose.test.yml"
else
    echo "❌ Error: Cannot locate docker-compose.test.yml"
    echo "Tried: ../docker-compose.test.yml (app/ context) and docker-compose.test.yml (repo root context)"
    exit 1
fi

# Get container ports using docker compose port command
KONG_PORT=$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" port kong 8000 2>/dev/null | cut -d: -f2)
DB_PORT=$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" port db 5432 2>/dev/null | cut -d: -f2)

if [ -z "$KONG_PORT" ] || [ -z "$DB_PORT" ]; then
    echo "❌ Error: Could not determine container ports"
    echo "Is the Docker Compose stack running?"
    echo "Run: docker compose -p $PROJECT_NAME ps"
    exit 1
fi

# Static credentials (matching docker-compose.test.yml)
DB_HOST="localhost"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASSWORD="postgres"
DB_URL="postgresql://postgres:postgres@localhost:${DB_PORT}/postgres"

# API URL points to Kong gateway (not PostgREST directly)
API_URL="http://localhost:${KONG_PORT}"

# Static JWT keys (matching docker-compose.test.yml)
# These are the same keys used by Supabase Local for development
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"

# Generate anon and service_role JWTs
# Anon JWT (role: anon, never expires in test)
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

# Service role JWT (role: service_role, never expires in test)
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

# Generate .env.test file
cat > .env.test << EOF
# Test Environment Configuration
# Auto-generated from Docker Compose stack
# DO NOT commit this file - regenerate with: bun run test:env

# Supabase API URL (Kong gateway - provides /rest/v1/ routing to PostgREST)
SUPABASE_URL=$API_URL

# Supabase Keys (matching docker-compose.test.yml JWT secret)
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
echo "  API URL (Kong):  $API_URL"
echo "  Database:        $DB_URL"
echo "  Project Name:    $PROJECT_NAME"
echo ""
