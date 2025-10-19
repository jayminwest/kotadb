#!/usr/bin/env bash
# Development Environment Setup
# Automates Supabase lifecycle, .env generation, and development server startup

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Process tracking
API_PID=""
WEB_PID=""
MCP_PID=""
ADWS_MCP_PID=""

# Flag parsing
START_WEB=false
START_MCP=false
START_ADWS_MCP=false

for arg in "$@"; do
    case $arg in
        --web)
            START_WEB=true
            shift
            ;;
        --mcp-start)
            START_MCP=true
            shift
            ;;
        --adws-mcp-start)
            START_ADWS_MCP=true
            shift
            ;;
        *)
            echo -e "${RED}❌ Unknown flag: $arg${NC}"
            echo "Usage: ./scripts/dev-start.sh [--web] [--mcp-start] [--adws-mcp-start]"
            exit 1
            ;;
    esac
done

# Cleanup handler
cleanup() {
    echo ""
    echo -e "${YELLOW}🧹 Shutting down services...${NC}"

    if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
        echo "  Stopping API server (PID: $API_PID)..."
        kill "$API_PID" 2>/dev/null || true
    fi

    if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then
        echo "  Stopping web app (PID: $WEB_PID)..."
        kill "$WEB_PID" 2>/dev/null || true
    fi

    if [ -n "$MCP_PID" ] && kill -0 "$MCP_PID" 2>/dev/null; then
        echo "  Stopping MCP server (PID: $MCP_PID)..."
        kill "$MCP_PID" 2>/dev/null || true
    fi

    if [ -n "$ADWS_MCP_PID" ] && kill -0 "$ADWS_MCP_PID" 2>/dev/null; then
        echo "  Stopping ADW MCP server (PID: $ADWS_MCP_PID)..."
        kill "$ADWS_MCP_PID" 2>/dev/null || true
    fi

    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

# Register cleanup trap
trap cleanup SIGINT SIGTERM EXIT

echo -e "${BLUE}🚀 Starting KotaDB development environment...${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Error: Docker is not installed${NC}"
    echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    echo "Start Docker Desktop or run: sudo systemctl start docker"
    exit 1
fi

if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Error: Supabase CLI is not installed${NC}"
    echo "Install: brew install supabase/tap/supabase"
    exit 1
fi

if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Error: Bun is not installed${NC}"
    echo "Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites satisfied${NC}"
echo ""

# Supabase lifecycle management
echo -e "${BLUE}📦 Managing Supabase instance...${NC}"

# Stop any existing Supabase containers
echo "  Stopping existing Supabase containers..."
supabase stop 2>/dev/null || true

# Start fresh Supabase instance
echo "  Starting Supabase..."
SUPABASE_OUTPUT=$(supabase start 2>&1)

# Parse Supabase credentials from output
# Note: Supabase CLI v2.48+ uses "Publishable key" and "Secret key" instead of "anon key" and "service_role key"
# We support both formats for backwards compatibility
API_URL=$(echo "$SUPABASE_OUTPUT" | grep "API URL:" | awk '{print $3}')

# Try new format first (v2.48+)
ANON_KEY=$(echo "$SUPABASE_OUTPUT" | grep "Publishable key:" | awk '{print $3}')
SERVICE_KEY=$(echo "$SUPABASE_OUTPUT" | grep "Secret key:" | awk '{print $3}')

# Fallback to old format if new format not found
if [ -z "$ANON_KEY" ]; then
    ANON_KEY=$(echo "$SUPABASE_OUTPUT" | grep "anon key:" | awk '{print $3}')
fi
if [ -z "$SERVICE_KEY" ]; then
    SERVICE_KEY=$(echo "$SUPABASE_OUTPUT" | grep "service_role key:" | awk '{print $3}')
fi

if [ -z "$API_URL" ] || [ -z "$ANON_KEY" ] || [ -z "$SERVICE_KEY" ]; then
    echo -e "${RED}❌ Error: Failed to parse Supabase credentials${NC}"
    echo "Expected output format (v2.48+):"
    echo "  API URL: http://127.0.0.1:54322"
    echo "  Publishable key: sb_publishable_..."
    echo "  Secret key: sb_secret_..."
    echo ""
    echo "Or legacy format:"
    echo "  API URL: http://localhost:54321"
    echo "  anon key: eyJh..."
    echo "  service_role key: eyJh..."
    echo ""
    echo "Actual output:"
    echo "$SUPABASE_OUTPUT"
    exit 1
fi

echo -e "${GREEN}✅ Supabase started successfully${NC}"
echo "  API URL: $API_URL"
echo ""

# .env file generation
echo -e "${BLUE}🔧 Generating .env file...${NC}"

# Backup existing .env if it exists
if [ -f .env ]; then
    echo "  Backing up existing .env to .env.backup..."
    cp .env .env.backup
fi

# Preserve non-Supabase variables from existing .env
PRESERVED_VARS=""
if [ -f .env ]; then
    # Extract non-Supabase variables (PORT, KOTA_GIT_BASE_URL, ADW_*)
    PRESERVED_VARS=$(grep -v -E '^(SUPABASE_|#|$)' .env || true)
fi

# Write new .env atomically via temp file
ENV_TMP=$(mktemp)

cat > "$ENV_TMP" <<EOF
# KotaDB Development Environment
# Generated by dev-start.sh at $(date)

# Bun/TypeScript service configuration
PORT=3000
KOTA_GIT_BASE_URL=https://github.com

# Supabase Database Configuration (auto-generated from supabase start)
SUPABASE_URL=$API_URL
SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_KEY=$SERVICE_KEY

# Automation runtime configuration
ADW_ENV=local
ADW_LOG_ROOT=.adw_logs
ADW_RUNNER_IMAGE=kotadb-adw-runner:latest
ADW_GIT_REF=main
ADW_REPO_URL=
ADW_RUNNER_AUTO_PULL=true
ADW_DOCKER_BIN=docker
ADW_CONTAINER_LOG_PATH=/app/.adw_logs
ADW_HOST_LOG_PATH=/absolute/path/to/your/kotadb/.adw_logs
EOF

# Append preserved variables if any
if [ -n "$PRESERVED_VARS" ]; then
    echo "" >> "$ENV_TMP"
    echo "# Preserved from previous .env" >> "$ENV_TMP"
    echo "$PRESERVED_VARS" >> "$ENV_TMP"
fi

# Atomic move
mv "$ENV_TMP" .env

echo -e "${GREEN}✅ .env file generated${NC}"
echo ""

# Dependency validation
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    bun install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
    echo ""
fi

# API server startup
echo -e "${BLUE}🚀 Starting API server...${NC}"

# Check if port 3000 is already in use
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}❌ Error: Port 3000 is already in use${NC}"
    echo "Kill the process using: lsof -ti:3000 | xargs kill"
    exit 1
fi

# Start API server in background
bun run src/index.ts > .dev-api.log 2>&1 &
API_PID=$!

echo "  API server started (PID: $API_PID)"
echo "  Logs: .dev-api.log"

# Health check retry loop
echo "  Waiting for API server to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API server is healthy${NC}"
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo -e "${RED}❌ Error: API server did not become healthy in time${NC}"
        echo "Check logs: tail -f .dev-api.log"
        exit 1
    fi

    sleep 1
done

echo ""

# Optional web app startup
if [ "$START_WEB" = true ]; then
    echo -e "${BLUE}🌐 Starting web app...${NC}"

    # Check if web directory exists
    if [ ! -d "../web" ]; then
        echo -e "${YELLOW}⚠️  Warning: ../web directory not found, skipping web app startup${NC}"
    else
        # Check if port 5173 is already in use (Vite default)
        if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo -e "${RED}❌ Error: Port 5173 is already in use${NC}"
            echo "Kill the process using: lsof -ti:5173 | xargs kill"
            exit 1
        fi

        cd ../web
        npm run dev > ../.dev-web.log 2>&1 &
        WEB_PID=$!
        cd -

        echo "  Web app started (PID: $WEB_PID)"
        echo "  Logs: ../.dev-web.log"
        echo "  URL: http://localhost:5173"
        echo -e "${GREEN}✅ Web app is running${NC}"
        echo ""
    fi
fi

# Optional MCP server startup
if [ "$START_MCP" = true ]; then
    echo -e "${BLUE}🔌 Starting MCP server...${NC}"

    # MCP server command placeholder - update with actual command
    # This is a placeholder implementation - customize based on actual MCP server requirements
    echo -e "${YELLOW}⚠️  Warning: MCP server startup not yet implemented${NC}"
    echo "  Update dev-start.sh with actual MCP server startup command"
    echo ""

    # Example implementation (uncomment and customize):
    # bun run mcp/server.ts > .dev-mcp.log 2>&1 &
    # MCP_PID=$!
    # echo "  MCP server started (PID: $MCP_PID)"
    # echo "  Logs: .dev-mcp.log"
    # echo -e "${GREEN}✅ MCP server is running${NC}"
    # echo ""
fi

# Optional ADW MCP server startup
if [ "$START_ADWS_MCP" = true ]; then
    echo -e "${BLUE}🤖 Starting ADW MCP server...${NC}"

    # ADW MCP server command placeholder - update with actual command
    # This is a placeholder implementation - customize based on actual ADW MCP requirements
    echo -e "${YELLOW}⚠️  Warning: ADW MCP server startup not yet implemented${NC}"
    echo "  Update dev-start.sh with actual ADW MCP server startup command"
    echo ""

    # Example implementation (uncomment and customize):
    # cd ../automation/adws && uv run mcp_server.py > ../../.dev-adws-mcp.log 2>&1 &
    # ADWS_MCP_PID=$!
    # cd -
    # echo "  ADW MCP server started (PID: $ADWS_MCP_PID)"
    # echo "  Logs: ../.dev-adws-mcp.log"
    # echo -e "${GREEN}✅ ADW MCP server is running${NC}"
    # echo ""
fi

# Summary
echo -e "${GREEN}✨ Development environment ready!${NC}"
echo ""
echo "Services:"
echo "  ✅ Supabase:    $API_URL"
echo "  ✅ API Server:  http://localhost:3000"
if [ "$START_WEB" = true ] && [ -d "../web" ]; then
    echo "  ✅ Web App:     http://localhost:5173"
fi
if [ "$START_MCP" = true ]; then
    echo "  ⏳ MCP Server:  (not yet implemented)"
fi
if [ "$START_ADWS_MCP" = true ]; then
    echo "  ⏳ ADW MCP:     (not yet implemented)"
fi
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Keep script running and wait for signals
wait
