#!/usr/bin/env bash
set -euo pipefail

# Generate OpenAPI spec by starting the server temporarily and fetching the spec.
# The server starts without an API key (uses NoOp provider) — only the OpenAPI
# endpoint is needed, which requires no auth and no AI.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_FILE="$PROJECT_ROOT/schema/openapi.json"
PORT="${PORT:-3457}"
HOST="127.0.0.1"
MAX_RETRIES=30
RETRY_INTERVAL=1

mkdir -p "$PROJECT_ROOT/schema"
mkdir -p "$PROJECT_ROOT/tmp/sessions"

# Start the server in the background
DOT_AI_SESSION_DIR="$PROJECT_ROOT/tmp/sessions" \
  PORT="$PORT" \
  HOST="$HOST" \
  TRANSPORT_TYPE=http \
  node "$PROJECT_ROOT/dist/mcp/server.js" &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait for the server to be ready
echo "Waiting for server on $HOST:$PORT..."
for i in $(seq 1 $MAX_RETRIES); do
  if curl -sf "http://$HOST:$PORT/api/v1/openapi" -o /dev/null 2>/dev/null; then
    echo "Server ready after ${i}s"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "ERROR: Server process exited unexpectedly" >&2
    exit 1
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "ERROR: Server did not become ready within ${MAX_RETRIES}s" >&2
    exit 1
  fi
  sleep "$RETRY_INTERVAL"
done

# Fetch and save the OpenAPI spec
curl -sf "http://$HOST:$PORT/api/v1/openapi" | jq . > "$OUTPUT_FILE"

echo "OpenAPI spec written to $OUTPUT_FILE"
