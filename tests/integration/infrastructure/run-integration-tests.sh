#!/usr/bin/env bash

# Integration Test Runner
# Manages the complete integration test lifecycle:
# 1. Kill any existing MCP server
# 2. Build the project
# 3. Start MCP server in background
# 4. Run integration tests
# 5. Cleanup server on exit
#
# Usage:
#   ./run-integration-tests.sh [--no-cluster] [test-filter]
#   --no-cluster: Skip cluster and Qdrant setup (for lightweight tests)

set -e

# Parse command line arguments
NO_CLUSTER=false
TEST_ARGS=()
for arg in "$@"; do
    if [ "$arg" == "--no-cluster" ]; then
        NO_CLUSTER=true
    else
        TEST_ARGS+=("$arg")
    fi
done

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

# Step 3: Setup infrastructure (unless --no-cluster is specified)
if [ "$NO_CLUSTER" = false ]; then
    # Recreate Kind cluster for guaranteed clean state
    log_info "Deleting existing Kind cluster (if any)..."
    kind delete cluster --name dot-test 2>/dev/null || true

    log_info "Creating fresh Kind cluster..."
    kind create cluster --name dot-test --config=tests/integration/infrastructure/kind-test.yaml --kubeconfig ./kubeconfig-test.yaml || {
        log_error "Failed to create Kind cluster"
        exit 1
    }

    log_info "Exporting kubeconfig for test cluster..."
    kind export kubeconfig --name dot-test --kubeconfig ./kubeconfig-test.yaml || {
        log_error "Failed to export kubeconfig"
        exit 1
    }

    export KUBECONFIG=./kubeconfig-test.yaml

    # Start all operator installations in parallel
    log_info "Starting all operator installations in parallel..."

    # Optional: Install CloudNativePG operator (skip with SKIP_CNPG=true)
    if [[ "${SKIP_CNPG}" != "true" ]]; then
        log_info "Starting CloudNativePG installation..."
        kubectl apply -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.20/releases/cnpg-1.20.0.yaml
    else
        log_warn "Skipping CloudNativePG operator installation (SKIP_CNPG=true)"
    fi

    # Optional: Install Kyverno Policy Engine (skip with SKIP_KYVERNO=true)
    if [[ "${SKIP_KYVERNO}" != "true" ]]; then
        log_info "Starting Kyverno installation..."
        helm repo add kyverno https://kyverno.github.io/kyverno 2>/dev/null || true
        helm repo update
        helm upgrade --install kyverno kyverno/kyverno \
            --namespace kyverno --create-namespace \
            --timeout=300s || {
            log_error "Failed to install Kyverno"
            exit 1
        }
    else
        log_warn "Skipping Kyverno Policy Engine installation (SKIP_KYVERNO=true)"
    fi

    # Install nginx ingress controller
    log_info "Starting nginx ingress installation..."
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml || {
        log_error "Failed to install nginx ingress controller"
        exit 1
    }

    # Install dot-ai-controller (v0.17.0+) for Solution CR tracking
    log_info "Starting dot-ai-controller installation..."
    helm upgrade --install dot-ai-controller \
        oci://ghcr.io/vfarcic/dot-ai-controller/charts/dot-ai-controller:0.17.0 \
        --namespace dot-ai \
        --create-namespace || {
        log_error "Failed to install dot-ai-controller"
        exit 1
    }

    # Deploy Qdrant separately (without PVC) to preserve pre-populated data
    log_info "Starting Qdrant deployment with pre-populated data..."
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qdrant
  namespace: dot-ai
  labels:
    app: qdrant
spec:
  replicas: 1
  selector:
    matchLabels:
      app: qdrant
  template:
    metadata:
      labels:
        app: qdrant
    spec:
      containers:
      - name: qdrant
        image: ghcr.io/vfarcic/dot-ai-demo/qdrant:v1.15.5-test-01
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 6333
          name: http
        - containerPort: 6334
          name: grpc
---
apiVersion: v1
kind: Service
metadata:
  name: qdrant
  namespace: dot-ai
spec:
  selector:
    app: qdrant
  ports:
  - name: http
    port: 6333
    targetPort: 6333
  - name: grpc
    port: 6334
    targetPort: 6334
EOF

    # Build Docker image while operators install
    log_info "Creating npm package tarball..."
    npm pack || {
        log_error "Failed to create npm package"
        exit 1
    }

    log_info "Building local dot-ai Docker image..."
    docker build -t dot-ai:test . || {
        log_error "Failed to build dot-ai image"
        exit 1
    }

    # Clean up package tarball
    rm -f vfarcic-dot-ai-*.tgz

    log_info "Loading dot-ai image into Kind cluster..."
    kind load docker-image dot-ai:test --name dot-test || {
        log_error "Failed to load dot-ai image into Kind"
        exit 1
    }

    log_info "Qdrant image will be pulled by Kubernetes from GHCR when needed"

    # Wait for all operators to be ready
    log_info "Waiting for all operators to be ready..."

    if [[ "${SKIP_CNPG}" != "true" ]]; then
        log_info "Waiting for CloudNativePG operator..."
        kubectl wait --for=condition=Available deployment/cnpg-controller-manager \
            --namespace=cnpg-system --timeout=180s || {
            log_error "CloudNativePG operator failed to become ready"
            exit 1
        }
    fi

    if [[ "${SKIP_KYVERNO}" != "true" ]]; then
        log_info "Waiting for Kyverno deployments..."
        kubectl wait --for=condition=Available deployment/kyverno-admission-controller \
            --namespace=kyverno --timeout=180s || {
            log_error "Kyverno admission controller failed to become ready"
            exit 1
        }
        kubectl wait --for=condition=Available deployment/kyverno-background-controller \
            --namespace=kyverno --timeout=180s || {
            log_error "Kyverno background controller failed to become ready"
            exit 1
        }
        kubectl wait --for=condition=Available deployment/kyverno-cleanup-controller \
            --namespace=kyverno --timeout=180s || {
            log_error "Kyverno cleanup controller failed to become ready"
            exit 1
        }
        kubectl wait --for=condition=Available deployment/kyverno-reports-controller \
            --namespace=kyverno --timeout=180s || {
            log_error "Kyverno reports controller failed to become ready"
            exit 1
        }
    fi

    log_info "Waiting for nginx ingress controller..."
    kubectl wait --namespace ingress-nginx \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/component=controller \
        --timeout=300s || {
        log_error "Ingress controller failed to become ready"
        exit 1
    }

    log_info "Waiting for ingress admission webhook to be ready..."
    sleep 10  # Give webhook time to register and become available

    log_info "Waiting for dot-ai-controller..."
    kubectl wait --namespace dot-ai \
        --for=condition=available deployment/dot-ai-controller-manager \
        --timeout=180s || {
        log_error "dot-ai-controller failed to become ready"
        kubectl get pods -n dot-ai
        kubectl logs -n dot-ai -l control-plane=controller-manager --tail=50
        exit 1
    }

    log_info "Waiting for Qdrant..."
    kubectl wait --namespace dot-ai \
        --for=condition=available deployment/qdrant \
        --timeout=120s || {
        log_error "Qdrant deployment failed to become ready"
        kubectl get pods -n dot-ai
        kubectl logs -n dot-ai -l app=qdrant --tail=50
        exit 1
    }
else
    log_info "Skipping cluster and infrastructure setup (--no-cluster mode)"
fi

# Step 4: Create tmp directory for test artifacts
log_info "Cleaning up old session files and debug prompts/outputs..."
rm -rf ./tmp/sessions/*
# Clean debug prompts/outputs but keep evaluation datasets (cumulative)
find ./tmp/debug-ai -type f ! -name '*.jsonl' -delete 2>/dev/null || true
mkdir -p ./tmp/sessions
mkdir -p ./tmp/debug-ai

# Step 5: Deploy dot-ai via Helm (skip in --no-cluster mode)
if [ "$NO_CLUSTER" = false ]; then
    # Set provider defaults if not already set
    AI_PROVIDER=${AI_PROVIDER:-anthropic_haiku}

    log_info "Deploying dot-ai via Helm chart..."
    log_info "AI Provider: ${AI_PROVIDER}"

    # Create namespace for dot-ai
    kubectl create namespace dot-ai || true

    # Create secret with API keys
    kubectl create secret generic dot-ai-secrets \
        --namespace dot-ai \
        --from-literal=anthropic-api-key="${ANTHROPIC_API_KEY}" \
        --from-literal=openai-api-key="${OPENAI_API_KEY}" \
        --from-literal=google-api-key="${GOOGLE_API_KEY}" \
        --from-literal=xai-api-key="${XAI_API_KEY}" \
        --from-literal=moonshot-api-key="${MOONSHOT_API_KEY}" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Deploy via Helm with local images
    helm upgrade --install dot-ai ./charts \
        --namespace dot-ai \
        --set image.repository=dot-ai \
        --set image.tag=test \
        --set image.pullPolicy=Never \
        --set ai.provider="${AI_PROVIDER}" \
        --set controller.enabled=true \
        --set ingress.enabled=true \
        --set ingress.className=nginx \
        --set ingress.host=dot-ai.127.0.0.1.nip.io \
        --set qdrant.enabled=false \
        --set qdrant.external.url=http://qdrant.dot-ai.svc.cluster.local:6333 \
        --set-json 'extraEnv=[{"name":"QDRANT_CAPABILITIES_COLLECTION","value":"capabilities-policies"},{"name":"DEBUG_DOT_AI","value":"true"}]' \
        --wait --timeout=300s || {
        log_error "Failed to deploy dot-ai via Helm"
        kubectl get pods -n dot-ai
        kubectl logs -n dot-ai -l app.kubernetes.io/name=dot-ai --tail=50
        exit 1
    }

    log_info "Waiting for dot-ai deployment to be ready..."
    kubectl wait --namespace dot-ai \
        --for=condition=available deployment \
        --selector=app.kubernetes.io/name=dot-ai \
        --timeout=120s || {
        log_error "dot-ai deployment failed to become ready"
        kubectl get pods -n dot-ai
        kubectl logs -n dot-ai -l app.kubernetes.io/name=dot-ai --tail=50
        exit 1
    }

    # Wait for ingress to be accessible
    log_info "Waiting for ingress to be accessible..."
    MAX_WAIT=60
    WAITED=0
    MCP_URL="http://dot-ai.127.0.0.1.nip.io"
    while [ $WAITED -lt $MAX_WAIT ]; do
        if curl -sf "${MCP_URL}/api/v1/tools/version" -X POST -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1; then
            log_info "dot-ai MCP server is accessible at ${MCP_URL}"
            break
        fi
        sleep 2
        WAITED=$((WAITED + 2))
    done

    if [ $WAITED -ge $MAX_WAIT ]; then
        log_error "Ingress failed to become accessible within ${MAX_WAIT} seconds"
        kubectl get ingress -n dot-ai
        kubectl describe ingress -n dot-ai
        kubectl logs -n dot-ai -l app.kubernetes.io/name=dot-ai --tail=50
        exit 1
    fi

    # Override PORT to use ingress URL
    export MCP_BASE_URL="${MCP_URL}"
else
    # --no-cluster mode: Start MCP server on host
    AI_PROVIDER=${AI_PROVIDER:-anthropic_haiku}

    log_info "Starting MCP server on port ${PORT} (no-cluster mode)..."
    log_info "AI Provider: ${AI_PROVIDER}"

    KUBECONFIG=./kubeconfig-test.yaml \
    PORT=${PORT} \
    DOT_AI_SESSION_DIR=./tmp/sessions \
    DEBUG_DOT_AI=true \
    TRANSPORT_TYPE=http \
    QDRANT_URL=http://localhost:6335 \
    QDRANT_CAPABILITIES_COLLECTION=capabilities-policies \
    ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
    OPENAI_API_KEY=$OPENAI_API_KEY \
    GOOGLE_API_KEY=$GOOGLE_API_KEY \
    XAI_API_KEY=$XAI_API_KEY \
    MOONSHOT_API_KEY=$MOONSHOT_API_KEY \
    node dist/mcp/server.js > "$LOG_FILE" 2>&1 &

    SERVER_PID=$!
    echo $SERVER_PID > "$SERVER_PID_FILE"

    log_info "Server started with PID ${SERVER_PID}"
    log_info "Server logs: ${LOG_FILE}"

    # Wait for server to be ready
    log_info "Waiting for server to be ready..."
    MAX_WAIT=30
    WAITED=0
    while [ $WAITED -lt $MAX_WAIT ]; do
        if curl -sf http://localhost:${PORT}/api/v1/tools/version -X POST -H "Content-Type: application/json" -d '{}' > /dev/null 2>&1; then
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

    export MCP_BASE_URL="http://localhost:${PORT}"
fi

# Step 6: Run integration tests
log_info "Running integration tests..."
# Export AI provider configuration so tests can validate server is using correct settings
export AI_PROVIDER
npx vitest run --config=vitest.integration.config.ts --test-timeout=1200000 "${TEST_ARGS[@]}"

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    log_info "Integration tests passed!"
else
    log_error "Integration tests failed!"
    log_error "Check server logs at: ${LOG_FILE}"
fi

exit $TEST_EXIT_CODE
