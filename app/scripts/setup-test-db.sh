#!/usr/bin/env bash
# Setup Test Database
# Starts Docker Compose test stack, runs migrations, and seeds test data

set -euo pipefail

echo "🚀 Setting up Docker Compose test environment..."

# Trap handler for cleanup on exit
cleanup() {
    if [ -n "${PROJECT_NAME:-}" ] && [ -f .test-project-name ]; then
        echo ""
        echo "🧹 Cleaning up on exit..."
        ./scripts/cleanup-test-containers.sh "$PROJECT_NAME" || true
    fi
}

# Register trap handler for EXIT, INT, TERM
trap cleanup EXIT INT TERM

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Start Docker Desktop or run: sudo systemctl start docker"
    exit 1
fi

# Generate unique project name for isolation
# Format: kotadb-test-<timestamp>-<pid>
PROJECT_NAME="kotadb-test-$(date +%s)-$$"
export PROJECT_NAME

echo "📝 Project name: $PROJECT_NAME"

# Store project name for other scripts to use
echo "$PROJECT_NAME" > .test-project-name

# Start database first (GoTrue needs it)
echo "📦 Starting database service..."
docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml up -d db

# Wait for database to be healthy
echo "⏳ Waiting for database to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml ps db 2>/dev/null | grep -q "healthy"; then
        echo "✅ Database is healthy!"
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo "❌ Error: Database did not become healthy in time"
        docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml logs db
        exit 1
    fi

    echo "  Waiting for database... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

# Verify database actually accepts connections (not just healthy)
echo "⏳ Verifying database accepts connections..."
MAX_CONN_ATTEMPTS=15
CONN_ATTEMPT=0

while [ $CONN_ATTEMPT -lt $MAX_CONN_ATTEMPTS ]; do
    if docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml exec -T db psql -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1; then
        echo "✅ Database is accepting connections!"
        break
    fi

    CONN_ATTEMPT=$((CONN_ATTEMPT + 1))
    if [ $CONN_ATTEMPT -eq $MAX_CONN_ATTEMPTS ]; then
        echo "❌ Error: Database is not accepting connections"
        docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml logs db
        exit 1
    fi

    echo "  Verifying connection... ($CONN_ATTEMPT/$MAX_CONN_ATTEMPTS)"
    sleep 1
done

# Start auth service (creates auth schema)
echo "📦 Starting auth service..."
docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml up -d auth

# Wait for auth to be healthy
echo "⏳ Waiting for auth service to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml ps auth 2>/dev/null | grep -q "healthy"; then
        echo "✅ Auth service is healthy!"
        # Give GoTrue extra time to complete migrations
        sleep 2
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo "❌ Error: Auth service did not become healthy in time"
        docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml logs auth
        exit 1
    fi

    echo "  Waiting for auth... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

# Run migrations (now that auth schema exists from GoTrue)
echo "🔄 Running migrations..."
./scripts/run-migrations-compose.sh "$PROJECT_NAME"

# Start remaining services (rest, kong)
echo "📦 Starting remaining services (rest, kong)..."
docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml up -d

# Wait for all services to be healthy
echo "⏳ Waiting for all services to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    # Check if all services with healthchecks are healthy (db, auth, kong = 3)
    # Note: PostgREST (rest) doesn't have a healthcheck, so we only wait for 3 services
    HEALTHY_COUNT=$(docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml ps --format json 2>/dev/null | \
        grep -c '"Health":"healthy"' || echo "0")

    if [ "$HEALTHY_COUNT" -ge 3 ]; then
        echo "✅ All services are healthy!"
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo "❌ Error: Services did not become healthy in time"
        echo "Check container logs:"
        docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml logs
        exit 1
    fi

    echo "  Waiting for services ($HEALTHY_COUNT/3 healthy)... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

# Generate .env.test from container ports (now that all services are running)
echo "🔧 Generating .env.test from container ports..."
./scripts/generate-env-test-compose.sh "$PROJECT_NAME"

# Load environment variables for seeding
if [ -f .env.test ]; then
    export $(grep -v '^#' .env.test | xargs)
fi

# Seed test data
echo "🌱 Seeding test data..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < supabase/seed.sql > /dev/null 2>&1

# Save project name for final output (before unsetting)
SAVED_PROJECT_NAME="$PROJECT_NAME"

# Disable trap now that setup is complete
# Note: We unset PROJECT_NAME so cleanup handler won't run on successful exit
unset PROJECT_NAME
trap - EXIT INT TERM

echo "✅ Docker Compose test setup complete!"
echo ""
echo "Services:"
echo "  Kong Gateway:  http://localhost:$(docker compose -p "$SAVED_PROJECT_NAME" -f ../docker-compose.test.yml port kong 8000 | cut -d: -f2)"
echo "  Database:      postgresql://postgres:postgres@localhost:$(docker compose -p "$SAVED_PROJECT_NAME" -f ../docker-compose.test.yml port db 5432 | cut -d: -f2)/postgres"
echo ""
echo "Test API Keys:"
echo "  Free tier:  kota_free_test1234567890ab_0123456789abcdef0123456789abcdef"
echo "  Solo tier:  kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef"
echo "  Team tier:  kota_team_team1234567890ab_0123456789abcdef0123456789abcdef"
echo ""
echo "Project Name:  $SAVED_PROJECT_NAME"
echo "  (stored in .test-project-name)"
echo ""
echo "💡 Tip: Run 'bun test' to run the test suite"
echo "💡 Tip: Run './scripts/cleanup-test-containers.sh' or 'bun run test:teardown' when done"
echo ""
