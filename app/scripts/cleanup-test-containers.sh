#!/usr/bin/env bash
# Cleanup Test Containers
# Destroys Docker Compose stack and removes volumes
# Includes trap handlers for guaranteed cleanup on exit

set -euo pipefail

PROJECT_NAME="${1:-}"

if [ -z "$PROJECT_NAME" ]; then
    # Try to read from .test-project-name file if no argument provided
    if [ -f .test-project-name ]; then
        PROJECT_NAME=$(cat .test-project-name)
        echo "📖 Read project name from .test-project-name: $PROJECT_NAME"
    else
        echo "❌ Error: PROJECT_NAME argument is required"
        echo "Usage: $0 <project-name>"
        echo "Or ensure .test-project-name file exists"
        exit 1
    fi
fi

echo "🧹 Cleaning up Docker Compose stack: $PROJECT_NAME"

# Stop Stripe CLI if running
if [ -f .stripe-test.pid ]; then
    echo "  ✓ Stopping Stripe CLI..."
    kill $(cat .stripe-test.pid) 2>/dev/null || true
    rm -f .stripe-test.pid .stripe-listen.log
fi

# Stop and remove containers, networks, and volumes
docker compose -p "$PROJECT_NAME" -f ../docker-compose.test.yml down -v 2>/dev/null || true

# Remove the project name file if it exists
if [ -f .test-project-name ]; then
    rm -f .test-project-name
    echo "  ✓ Removed .test-project-name file"
fi

# Verify cleanup
REMAINING=$(docker ps -a --filter "name=${PROJECT_NAME}" --format "{{.Names}}" | wc -l)
if [ "$REMAINING" -eq 0 ]; then
    echo "✅ Cleanup complete! All containers removed."
else
    echo "⚠️  Warning: Some containers may still be running:"
    docker ps -a --filter "name=${PROJECT_NAME}"
fi
