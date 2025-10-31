#!/usr/bin/env bash
# Setup Docker Compose Test Stack for CI Environment
# Starts isolated Docker Compose services and generates .env.test for GitHub Actions

set -euo pipefail

echo "🚀 Setting up Docker Compose test environment for CI..."

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    exit 1
fi

# Generate unique project name for CI isolation
# Format: kotadb-ci-<github-run-id>-<github-run-attempt>
# Falls back to timestamp if not in GitHub Actions
if [ -n "${GITHUB_RUN_ID:-}" ]; then
    PROJECT_NAME="kotadb-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT:-1}"
else
    PROJECT_NAME="kotadb-ci-$(date +%s)-$$"
fi

export PROJECT_NAME

echo "📝 Project name: $PROJECT_NAME"

# Store project name for cleanup script
echo "$PROJECT_NAME" > .test-project-name

# Start database first (GoTrue needs it)
echo "📦 Starting database service..."
docker compose -p "$PROJECT_NAME" -f docker-compose.test.yml up -d db

# Wait for database to be healthy
echo "⏳ Waiting for database to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker compose -p "$PROJECT_NAME" ps db 2>/dev/null | grep -q "healthy"; then
        echo "✅ Database is healthy!"
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo "❌ Error: Database did not become healthy in time"
        docker compose -p "$PROJECT_NAME" logs db
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
    if docker compose -p "$PROJECT_NAME" exec -T db psql -U postgres -d postgres -c "SELECT 1" >/dev/null 2>&1; then
        echo "✅ Database is accepting connections!"
        break
    fi

    CONN_ATTEMPT=$((CONN_ATTEMPT + 1))
    if [ $CONN_ATTEMPT -eq $MAX_CONN_ATTEMPTS ]; then
        echo "❌ Error: Database is not accepting connections"
        docker compose -p "$PROJECT_NAME" logs db
        exit 1
    fi

    echo "  Verifying connection... ($CONN_ATTEMPT/$MAX_CONN_ATTEMPTS)"
    sleep 1
done

# Give database extra time to be ready for network connections from other containers
echo "⏳ Waiting for database to be ready for network connections..."
sleep 3

# Start auth service (creates auth schema)
echo "📦 Starting auth service..."
docker compose -p "$PROJECT_NAME" -f docker-compose.test.yml up -d auth

# Wait for auth to be healthy
echo "⏳ Waiting for auth service to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker compose -p "$PROJECT_NAME" ps auth 2>/dev/null | grep -q "healthy"; then
        echo "✅ Auth service is healthy!"
        # Give GoTrue extra time to complete migrations
        sleep 2
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo "❌ Error: Auth service did not become healthy in time"
        docker compose -p "$PROJECT_NAME" logs auth
        exit 1
    fi

    echo "  Waiting for auth... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

# Run migrations (now that auth schema exists from GoTrue)
# Note: We run migrations before starting other services to ensure schema is ready
echo "🔄 Running migrations..."
app/scripts/run-migrations-compose.sh "$PROJECT_NAME"

# Start remaining services (rest, kong)
echo "📦 Starting remaining services (rest, kong)..."
docker compose -p "$PROJECT_NAME" -f docker-compose.test.yml up -d

# Wait for all services with healthchecks to be healthy
echo "⏳ Waiting for all services to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    # Check if all 3 services with healthchecks are healthy (db, auth, kong)
    # Note: rest (PostgREST) doesn't have a healthcheck due to missing curl/wget in the image
    HEALTHY_COUNT=$(docker compose -p "$PROJECT_NAME" ps --format json 2>/dev/null | \
        grep -c '"Health":"healthy"' || echo "0")

    if [ "$HEALTHY_COUNT" -ge 3 ]; then
        echo "✅ All services are healthy!"
        # Give PostgREST a moment to finish starting (it has no healthcheck)
        sleep 2
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo "❌ Error: Services did not become healthy in time"
        echo "Container status:"
        docker compose -p "$PROJECT_NAME" ps
        echo ""
        echo "Container logs:"
        docker compose -p "$PROJECT_NAME" logs
        exit 1
    fi

    echo "  Waiting for services ($HEALTHY_COUNT/3 healthy)... ($ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

# Generate .env.test from container ports (now that all services are running)
echo "🔧 Generating .env.test from container ports..."
app/scripts/generate-env-test-compose.sh "$PROJECT_NAME"

# Load environment variables for seeding
if [ -f .env.test ]; then
    export $(grep -v '^#' .env.test | xargs)
fi

# Seed test data
if [ -f "app/supabase/seed.sql" ]; then
    echo "🌱 Seeding test data..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME < app/supabase/seed.sql > /dev/null 2>&1 || {
        echo "⚠️  Warning: Seeding failed, continuing anyway..."
    }
    echo "✅ Test data seeded successfully!"
fi

# Start Stripe CLI listener if credentials configured
if [ -n "${STRIPE_SECRET_KEY:-}" ]; then
    echo "🔧 Starting Stripe CLI listener..."

    # Check if Stripe CLI is available
    if ! command -v stripe >/dev/null 2>&1; then
        echo "⚠️  Stripe CLI not installed, skipping Stripe webhook tests"
    else
        # Start listener in background
        stripe listen --forward-to "${SUPABASE_URL}/webhooks/stripe" --skip-verify > .stripe-listen.log 2>&1 &
        STRIPE_CLI_PID=$!
        echo "$STRIPE_CLI_PID" > .stripe-test.pid

        # Wait for listener to be ready
        sleep 2

        # Extract webhook secret
        STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret 2>/dev/null || echo "")
        export STRIPE_WEBHOOK_SECRET

        # Regenerate .env.test with Stripe webhook secret
        app/scripts/generate-env-test-compose.sh "$PROJECT_NAME"

        echo "✅ Stripe CLI listener started (webhook secret: ${STRIPE_WEBHOOK_SECRET:0:20}...)"
    fi
fi

echo ""
echo "Configuration:"
echo "  API URL (Kong):  $SUPABASE_URL"
echo "  Database:        $DATABASE_URL"
echo "  Project Name:    $PROJECT_NAME"
if [ -n "${STRIPE_SECRET_KEY:-}" ] && [ -n "${STRIPE_WEBHOOK_SECRET:-}" ]; then
    echo "  Stripe webhook:  ${SUPABASE_URL}/webhooks/stripe"
fi
echo ""
echo "🎉 Docker Compose test setup complete for CI!"
