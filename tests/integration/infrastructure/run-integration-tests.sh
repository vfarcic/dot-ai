#!/usr/bin/env bash

# Integration Test Runner
# Manages the complete integration test lifecycle:
# 1. Kill any existing MCP server
# 2. Build the project
# 3. Start MCP server in background
# 4. Run integration tests
# 5. Cleanup server on exit

set -e

# Configuration
PORT=3456
SERVER_PID_FILE="./tmp/integration-server.pid"
LOG_FILE="./tmp/integration-server.log"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Function to kill server
kill_server() {
    log_info "Checking for existing server on port ${PORT}..."

    # Kill by PID file if it exists
    if [ -f "$SERVER_PID_FILE" ]; then
        SERVER_PID=$(cat "$SERVER_PID_FILE")
        if ps -p "$SERVER_PID" > /dev/null 2>&1; then
            log_info "Killing server with PID ${SERVER_PID}..."
            kill "$SERVER_PID" 2>/dev/null || true
            sleep 2
        fi
        rm -f "$SERVER_PID_FILE"
    fi

    # Also kill by port (in case PID file is stale)
    if lsof -ti:${PORT} > /dev/null 2>&1; then
        log_warn "Found process on port ${PORT}, killing..."
        lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true
        sleep 2
    fi

    log_info "Port ${PORT} is clear"
}

# Function to cleanup on exit
cleanup() {
    EXIT_CODE=$?
    log_info "Cleaning up..."
    kill_server
    exit $EXIT_CODE
}

# Register cleanup handler
trap cleanup EXIT INT TERM

# Step 1: Kill existing server
kill_server

# Step 2: Build the project
log_info "Building project..."
npm run build || {
    log_error "Build failed"
    exit 1
}

# Step 3: Create tmp directory for logs, PID, and sessions
mkdir -p ./tmp/sessions

# Step 4: Start MCP server in background
log_info "Starting MCP server on port ${PORT}..."
KUBECONFIG=./kubeconfig-test.yaml \
PORT=${PORT} \
DOT_AI_SESSION_DIR=./tmp/sessions \
TRANSPORT_TYPE=http \
QDRANT_URL=http://localhost:6335 \
QDRANT_CAPABILITIES_COLLECTION=capabilities-policies \
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
OPENAI_API_KEY=$OPENAI_API_KEY \
node dist/mcp/server.js > "$LOG_FILE" 2>&1 &

SERVER_PID=$!
echo $SERVER_PID > "$SERVER_PID_FILE"

log_info "Server started with PID ${SERVER_PID}"
log_info "Server logs: ${LOG_FILE}"

# Step 5: Wait for server to be ready
log_info "Waiting for server to be ready..."
MAX_WAIT=30
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:${PORT}/health > /dev/null 2>&1; then
        log_info "Server is ready!"
        break
    fi

    # Check if server process died
    if ! ps -p $SERVER_PID > /dev/null 2>&1; then
        log_error "Server process died during startup"
        log_error "Last 20 lines of server log:"
        tail -20 "$LOG_FILE"
        exit 1
    fi

    sleep 1
    WAITED=$((WAITED + 1))
done

if [ $WAITED -eq $MAX_WAIT ]; then
    log_error "Server failed to start within ${MAX_WAIT} seconds"
    log_error "Last 20 lines of server log:"
    tail -20 "$LOG_FILE"
    exit 1
fi

# Step 6: Run integration tests
log_info "Running integration tests..."
npx vitest run --config=vitest.integration.config.ts --test-timeout=1200000 "$@"

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    log_info "Integration tests passed!"
else
    log_error "Integration tests failed!"
    log_error "Check server logs at: ${LOG_FILE}"
fi

exit $TEST_EXIT_CODE
