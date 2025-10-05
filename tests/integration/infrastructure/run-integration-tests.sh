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

# Step 3: Recreate Kind cluster for guaranteed clean state
log_info "Deleting existing Kind cluster (if any)..."
kind delete cluster --name dot-test 2>/dev/null || true

log_info "Creating fresh Kind cluster..."
kind create cluster --name dot-test --config=tests/integration/infrastructure/kind-test.yaml || {
    log_error "Failed to create Kind cluster"
    exit 1
}

log_info "Exporting kubeconfig for test cluster..."
kind export kubeconfig --name dot-test --kubeconfig ./kubeconfig-test.yaml || {
    log_error "Failed to export kubeconfig"
    exit 1
}

log_info "Installing CloudNativePG operator (async)..."
export KUBECONFIG=./kubeconfig-test.yaml
kubectl apply -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.20/releases/cnpg-1.20.0.yaml

log_info "Installing Kyverno Policy Engine (synchronous - webhooks need time)..."
helm repo add kyverno https://kyverno.github.io/kyverno 2>/dev/null || true
helm repo update
helm upgrade --install kyverno kyverno/kyverno \
    --namespace kyverno --create-namespace \
    --wait --timeout=300s || {
    log_error "Failed to install Kyverno"
    exit 1
}

log_info "Starting fresh Qdrant test container..."
# Remove existing container if it exists
docker rm -f qdrant-test 2>/dev/null || true

# Create fresh container from test image
docker run -d -p 6335:6333 --name qdrant-test ghcr.io/vfarcic/dot-ai-demo/qdrant:tests-latest || {
    log_error "Failed to start Qdrant container"
    exit 1
}

# Wait for Qdrant to be ready
sleep 3

# Step 4: Create tmp directory for logs, PID, and sessions
log_info "Cleaning up old session files..."
rm -rf ./tmp/sessions/*
mkdir -p ./tmp/sessions

# Step 5: Start MCP server in background
log_info "Starting MCP server on port ${PORT}..."
log_info "Using default AI provider (Anthropic Claude Sonnet with native SDK)..."
KUBECONFIG=./kubeconfig-test.yaml \
PORT=${PORT} \
DOT_AI_SESSION_DIR=./tmp/sessions \
TRANSPORT_TYPE=http \
QDRANT_URL=http://localhost:6335 \
QDRANT_CAPABILITIES_COLLECTION=capabilities-policies \
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
OPENAI_API_KEY=$OPENAI_API_KEY \
GOOGLE_API_KEY=$GOOGLE_API_KEY \
node dist/mcp/server.js > "$LOG_FILE" 2>&1 &
# AI_PROVIDER=openai \
# AI_PROVIDER_SDK=vercel \

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
