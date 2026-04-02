#!/usr/bin/env bash

# Integration Test Runner
# Manages the complete integration test lifecycle:
# 1. Build the project
# 2. Create Kind cluster with operators
# 3. Deploy dot-ai via Helm
# 4. Run integration tests
#
# Usage:
#   ./run-integration-tests.sh [test-filter]

set -e

# Collect test filter arguments
TEST_ARGS=("$@")

# When a test filter is provided, apply its infrastructure profile
# to install only the components needed for that specific test
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ${#TEST_ARGS[@]} -gt 0 ]]; then
    source "${SCRIPT_DIR}/infra-profiles.sh"
    init_profiles
    for arg in "${TEST_ARGS[@]}"; do
        apply_profile "$arg"
    done
fi

# Configuration
TEST_AUTH_TOKEN="test-auth-token-integration"
RBAC_ENABLED="${RBAC_ENABLED:-true}"

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

# Step 1: Build the project (skip with SKIP_BUILD=true when pre-built artifacts are available)
if [[ "${SKIP_BUILD}" != "true" ]]; then
    log_info "Building project..."
    npm run build || {
        log_error "Build failed"
        exit 1
    }
else
    log_warn "Skipping project build (SKIP_BUILD=true)"
fi

# Step 2: Setup infrastructure
# Recreate Kind cluster for guaranteed clean state
log_info "Deleting existing Kind cluster (if any)..."
kind delete cluster --name dot-ai-test 2>/dev/null || true

log_info "Creating fresh Kind cluster..."
kind create cluster --name dot-ai-test --config=tests/integration/infrastructure/kind-test.yaml --kubeconfig ./kubeconfig-test.yaml || {
    log_error "Failed to create Kind cluster"
    exit 1
}

log_info "Exporting kubeconfig for test cluster..."
kind export kubeconfig --name dot-ai-test --kubeconfig ./kubeconfig-test.yaml || {
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

# Optional: Install Prometheus for MCP server integration testing (skip with SKIP_PROMETHEUS_MCP=true)
# Uses release name 'dot-ai-prometheus' to avoid ClusterRole name collision with
# the recommend test (which deploys its own Prometheus release in monitoring namespace)
if [[ "${SKIP_PROMETHEUS_MCP}" != "true" ]]; then
    log_info "Starting Prometheus installation (PRD #358)..."
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
    helm repo update
    helm upgrade --install dot-ai-prometheus prometheus-community/prometheus \
        --namespace dot-ai --create-namespace \
        --set server.persistentVolume.enabled=false \
        --set alertmanager.enabled=false \
        --set kube-state-metrics.enabled=false \
        --set prometheus-node-exporter.enabled=false \
        --set prometheus-pushgateway.enabled=false \
        --timeout=300s || {
        log_error "Failed to install Prometheus"
        exit 1
    }
else
    log_warn "Skipping Prometheus installation (SKIP_PROMETHEUS_MCP=true)"
fi

# Optional: Install Argo CD via Helm (skip with SKIP_ARGOCD=true)
if [[ "${SKIP_ARGOCD}" != "true" ]]; then
    log_info "Starting Argo CD installation..."
    helm repo add argo https://argoproj.github.io/argo-helm 2>/dev/null || true
    helm repo update
    helm upgrade --install argocd argo/argo-cd \
        --namespace argocd --create-namespace \
        --set server.enabled=false \
        --set dex.enabled=false \
        --set notifications.enabled=false \
        --timeout=300s || {
        log_error "Failed to install Argo CD"
        exit 1
    }
else
    log_warn "Skipping Argo CD installation (SKIP_ARGOCD=true)"
fi

# Optional: Install Flux (skip with SKIP_FLUX=true)
if [[ "${SKIP_FLUX}" != "true" ]]; then
    log_info "Starting Flux installation..."
    kubectl apply -f https://github.com/fluxcd/flux2/releases/latest/download/install.yaml || {
        log_error "Failed to install Flux"
        exit 1
    }
else
    log_warn "Skipping Flux installation (SKIP_FLUX=true)"
fi

# Install nginx ingress controller
log_info "Starting nginx ingress installation..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml || {
    log_error "Failed to install nginx ingress controller"
    exit 1
}

# Install dot-ai-controller (latest) for Solution CR tracking and resource sync
log_info "Starting dot-ai-controller installation..."
helm upgrade --install dot-ai-controller \
    oci://ghcr.io/vfarcic/dot-ai-controller/charts/dot-ai-controller \
    --namespace dot-ai \
    --create-namespace || {
    log_error "Failed to install dot-ai-controller"
    exit 1
}

# Deploy Qdrant separately (without PVC) to preserve pre-populated data
# Use 384-dim image for local embeddings (CI), 1536-dim image for OpenAI embeddings (local dev)
if [[ "${USE_LOCAL_EMBEDDINGS}" == "true" ]]; then
    QDRANT_TEST_IMAGE="ghcr.io/vfarcic/dot-ai-demo/qdrant:v1.15.5-test-384-01"
else
    QDRANT_TEST_IMAGE="ghcr.io/vfarcic/dot-ai-demo/qdrant:v1.15.5-test-01"
fi
log_info "Starting Qdrant deployment with pre-populated data (image: ${QDRANT_TEST_IMAGE})..."
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
        image: ${QDRANT_TEST_IMAGE}
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

# Optional: Deploy Prometheus MCP server for MCP client integration testing (skip with SKIP_PROMETHEUS_MCP=true)
if [[ "${SKIP_PROMETHEUS_MCP}" != "true" ]]; then
    log_info "Starting Prometheus MCP server deployment (PRD #358)..."
    cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus-mcp
  namespace: dot-ai
  labels:
    app: prometheus-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus-mcp
  template:
    metadata:
      labels:
        app: prometheus-mcp
    spec:
      containers:
      - name: prometheus-mcp
        image: ghcr.io/pab1it0/prometheus-mcp-server:latest
        env:
        - name: PROMETHEUS_URL
          value: "http://dot-ai-prometheus-server.dot-ai.svc:80"
        - name: PROMETHEUS_MCP_SERVER_TRANSPORT
          value: "http"
        - name: PROMETHEUS_MCP_BIND_HOST
          value: "0.0.0.0"
        - name: PROMETHEUS_MCP_BIND_PORT
          value: "8080"
        ports:
        - containerPort: 8080
          name: http
        readinessProbe:
          tcpSocket:
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: prometheus-mcp
  namespace: dot-ai
spec:
  selector:
    app: prometheus-mcp
  ports:
  - name: http
    port: 8080
    targetPort: 8080
EOF
    log_info "Prometheus MCP server image will be pulled by Kubernetes from GHCR when needed"
else
    log_warn "Skipping Prometheus MCP server deployment (SKIP_PROMETHEUS_MCP=true)"
fi

# Build Docker images while operators install (skip with SKIP_DOCKER_BUILD=true when pre-built images are available)
if [[ "${SKIP_DOCKER_BUILD}" != "true" ]]; then
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

    log_info "Pre-building agentic-tools (native build avoids QEMU issues)..."
    (cd packages/agentic-tools && npm ci && npm run build && npm prune --omit=dev) || {
        log_error "Failed to pre-build agentic-tools"
        exit 1
    }

    log_info "Building agentic-tools plugin Docker image (PRD #343)..."
    docker build -t dot-ai-agentic-tools:test ./packages/agentic-tools || {
        log_error "Failed to build agentic-tools image"
        exit 1
    }
else
    log_warn "Skipping Docker builds (SKIP_DOCKER_BUILD=true)"
fi

log_info "Loading dot-ai image into Kind cluster..."
kind load docker-image dot-ai:test --name dot-ai-test || {
    log_error "Failed to load dot-ai image into Kind"
    exit 1
}

log_info "Loading agentic-tools plugin image into Kind cluster..."
kind load docker-image dot-ai-agentic-tools:test --name dot-ai-test || {
    log_error "Failed to load agentic-tools image into Kind"
    exit 1
}

log_info "Qdrant image will be pulled by Kubernetes from GHCR when needed"

# Wait for all operators to be ready
log_info "Waiting for all operators to be ready..."

if [[ "${SKIP_CNPG}" != "true" ]]; then
    log_info "Waiting for CloudNativePG operator..."
    kubectl wait --for=condition=Available deployment/cnpg-controller-manager \
        --namespace=cnpg-system --timeout=480s || {
        log_error "CloudNativePG operator failed to become ready"
        exit 1
    }
fi

if [[ "${SKIP_KYVERNO}" != "true" ]]; then
    log_info "Waiting for Kyverno deployments..."
    kubectl wait --for=condition=Available deployment/kyverno-admission-controller \
        --namespace=kyverno --timeout=480s || {
        log_error "Kyverno admission controller failed to become ready"
        exit 1
    }
    kubectl wait --for=condition=Available deployment/kyverno-background-controller \
        --namespace=kyverno --timeout=480s || {
        log_error "Kyverno background controller failed to become ready"
        exit 1
    }
    kubectl wait --for=condition=Available deployment/kyverno-cleanup-controller \
        --namespace=kyverno --timeout=480s || {
        log_error "Kyverno cleanup controller failed to become ready"
        exit 1
    }
    kubectl wait --for=condition=Available deployment/kyverno-reports-controller \
        --namespace=kyverno --timeout=480s || {
        log_error "Kyverno reports controller failed to become ready"
        exit 1
    }
fi

if [[ "${SKIP_ARGOCD}" != "true" ]]; then
    log_info "Waiting for Argo CD application controller..."
    kubectl wait --for=condition=Ready pod -l app.kubernetes.io/name=argocd-application-controller \
        --namespace=argocd --timeout=300s || {
        log_error "Argo CD application controller failed to become ready"
        exit 1
    }

    log_info "Waiting for Argo CD repo server..."
    kubectl wait --for=condition=Available deployment/argocd-repo-server \
        --namespace=argocd --timeout=300s || {
        log_error "Argo CD repo server failed to become ready"
        exit 1
    }
fi

if [[ "${SKIP_FLUX}" != "true" ]]; then
    log_info "Waiting for Flux source-controller..."
    kubectl wait --for=condition=Available deployment/source-controller \
        --namespace=flux-system --timeout=300s || {
        log_error "Flux source-controller failed to become ready"
        exit 1
    }

    log_info "Waiting for Flux kustomize-controller..."
    kubectl wait --for=condition=Available deployment/kustomize-controller \
        --namespace=flux-system --timeout=300s || {
        log_error "Flux kustomize-controller failed to become ready"
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

if [[ "${SKIP_PROMETHEUS_MCP}" != "true" ]]; then
    log_info "Waiting for Prometheus server (PRD #358)..."
    kubectl wait --namespace dot-ai \
        --for=condition=available deployment/dot-ai-prometheus-server \
        --timeout=120s || {
        log_error "Prometheus server failed to become ready"
        kubectl get pods -n dot-ai
        kubectl logs -n dot-ai -l app.kubernetes.io/instance=dot-ai-prometheus --tail=50
        exit 1
    }

    log_info "Waiting for Prometheus MCP server (PRD #358)..."
    kubectl wait --namespace dot-ai \
        --for=condition=available deployment/prometheus-mcp \
        --timeout=120s || {
        log_error "Prometheus MCP server failed to become ready"
        kubectl get pods -n dot-ai
        kubectl logs -n dot-ai -l app=prometheus-mcp --tail=50
        exit 1
    }
fi

# Step 3: Create tmp directory for test artifacts
log_info "Cleaning up old session files and debug prompts/outputs..."
rm -rf ./tmp/sessions/*
# Clean debug prompts/outputs but keep evaluation datasets (cumulative)
find ./tmp/debug-ai -type f ! -name '*.jsonl' -delete 2>/dev/null || true
mkdir -p ./tmp/sessions
mkdir -p ./tmp/debug-ai

# Step 4: Deploy dot-ai via Helm
# Set provider defaults if not already set
AI_PROVIDER=${AI_PROVIDER:-anthropic_haiku}

# Set user prompts repo - use private repo if token is available, otherwise public
if [[ -n "${DOT_AI_GIT_TOKEN}" ]]; then
    DOT_AI_USER_PROMPTS_REPO=${DOT_AI_USER_PROMPTS_REPO:-https://github.com/vfarcic/dot-ai-test-prompts.git}
    log_info "Using private user prompts repo (DOT_AI_GIT_TOKEN is set)"
else
    DOT_AI_USER_PROMPTS_REPO=${DOT_AI_USER_PROMPTS_REPO:-https://github.com/vfarcic/dot-ai.git}
    log_info "Using public user prompts repo (no DOT_AI_GIT_TOKEN)"
fi

log_info "Updating Helm chart dependencies..."
helm dependency update ./charts || {
    log_error "Failed to update Helm dependencies"
    exit 1
}

# Build optional MCP server Helm flags
HELM_MCP_ARGS=()
if [[ "${SKIP_PROMETHEUS_MCP}" != "true" ]]; then
    HELM_MCP_ARGS+=(
        --set mcpServers.prometheus.enabled=true
        --set mcpServers.prometheus.endpoint="http://prometheus-mcp.dot-ai.svc:8080/mcp"
        --set-json 'mcpServers.prometheus.attachTo=["remediate","query"]'
    )
fi

log_info "Deploying dot-ai via Helm chart..."
log_info "AI Provider: ${AI_PROVIDER}"

# Create namespace for dot-ai
kubectl create namespace dot-ai 2>/dev/null || true

# Create secret with API keys and auth token
# When using local embeddings, OpenAI key is not needed (TEI handles embeddings locally)
OPENAI_KEY_VALUE="${OPENAI_API_KEY}"
if [[ "${USE_LOCAL_EMBEDDINGS}" == "true" ]]; then
    OPENAI_KEY_VALUE="${OPENAI_API_KEY:-unused}"
fi
kubectl create secret generic dot-ai-secrets \
    --namespace dot-ai \
    --from-literal=anthropic-api-key="${DOT_AI_ANTHROPIC_API_KEY:-$ANTHROPIC_API_KEY}" \
    --from-literal=openai-api-key="${OPENAI_KEY_VALUE}" \
    --from-literal=google-api-key="${GOOGLE_GENERATIVE_AI_API_KEY:-$GOOGLE_API_KEY}" \
    --from-literal=xai-api-key="${XAI_API_KEY}" \
    --from-literal=moonshot-api-key="${MOONSHOT_API_KEY}" \
    --from-literal=alibaba-api-key="${ALIBABA_API_KEY}" \
    --from-literal=auth-token="${TEST_AUTH_TOKEN}" \
    --dry-run=client -o yaml | kubectl apply -f -

# Create Dex auth secret (required by chart when dex.enabled=true)
TEST_DEX_CLIENT_SECRET="test-client-secret-$(date +%s)"
TEST_JWT_SECRET="test-jwt-secret-$(date +%s)"
TEST_ADMIN_PASSWORD="test-admin-pass"
TEST_ADMIN_HASH=$(htpasswd -nbBC 10 "" "${TEST_ADMIN_PASSWORD}" | cut -d: -f2)
kubectl create secret generic dot-ai-dex-auth \
    --namespace dot-ai \
    --from-literal=DEX_CLIENT_SECRET="${TEST_DEX_CLIENT_SECRET}" \
    --from-literal=DOT_AI_JWT_SECRET="${TEST_JWT_SECRET}" \
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
    --set externalUrl=http://dot-ai.127.0.0.1.nip.io:8180 \
    --set dex.externalUrl=http://dex.dot-ai.127.0.0.1.nip.io:8180 \
    --set qdrant.enabled=false \
    --set qdrant.external.url=http://qdrant.dot-ai.svc.cluster.local:6333 \
    $([[ "${USE_LOCAL_EMBEDDINGS}" == "true" ]] && echo "--set localEmbeddings.enabled=true") \
    --set webUI.baseUrl="https://dot-ai-ui.test.local" \
    --set dex.enabled=true \
    --set dex.existingSecret=dot-ai-dex-auth \
    --set dex.adminPasswordHash="${TEST_ADMIN_HASH}" \
    --set-json 'dex.envFrom=[{"secretRef":{"name":"dot-ai-dex-auth"}}]' \
    --set plugins.agentic-tools.image.repository=dot-ai-agentic-tools \
    --set plugins.agentic-tools.image.tag=test \
    --set plugins.agentic-tools.image.pullPolicy=Never \
    "${HELM_MCP_ARGS[@]}" \
    --set rbac.enforcement.enabled="${RBAC_ENABLED}" \
    --set-json "extraEnv=[{\"name\":\"QDRANT_CAPABILITIES_COLLECTION\",\"value\":\"capabilities-policies\"},{\"name\":\"DEBUG_DOT_AI\",\"value\":\"true\"},{\"name\":\"DOT_AI_TELEMETRY\",\"value\":\"${DOT_AI_TELEMETRY:-false}\"},{\"name\":\"CI\",\"value\":\"true\"},{\"name\":\"DOT_AI_USER_PROMPTS_REPO\",\"value\":\"${DOT_AI_USER_PROMPTS_REPO}\"},{\"name\":\"DOT_AI_USER_PROMPTS_PATH\",\"value\":\"user-prompts\"},{\"name\":\"DOT_AI_GIT_TOKEN\",\"value\":\"${DOT_AI_GIT_TOKEN:-}\"},{\"name\":\"MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL\",\"value\":\"true\"}]" \
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

log_info "Waiting for Dex OIDC provider to be ready (PRD #380)..."
kubectl wait --namespace dot-ai \
    --for=condition=available deployment/dot-ai-dex \
    --timeout=120s || {
    log_error "Dex failed to become ready"
    kubectl get pods -n dot-ai
    kubectl logs -n dot-ai -l app.kubernetes.io/name=dex --tail=50
    exit 1
}

log_info "Waiting for agentic-tools plugin deployment to be ready (PRD #343)..."
kubectl wait --namespace dot-ai \
    --for=condition=available deployment/dot-ai-agentic-tools \
    --timeout=120s || {
    log_error "agentic-tools plugin deployment failed to become ready"
    kubectl get pods -n dot-ai
    kubectl logs -n dot-ai -l app.kubernetes.io/name=agentic-tools --tail=50
    exit 1
}

# Wait for local embedding service (TEI) if enabled — model download can take several minutes
if [[ "${USE_LOCAL_EMBEDDINGS}" == "true" ]]; then
    log_info "Waiting for local embedding service (TEI) to be ready (PRD #384)..."
    kubectl wait --namespace dot-ai \
        --for=condition=available deployment/dot-ai-local-embeddings \
        --timeout=600s || {
        log_error "Local embedding service (TEI) failed to become ready"
        kubectl get pods -n dot-ai
        kubectl logs -n dot-ai -l app.kubernetes.io/name=local-embeddings --tail=50
        exit 1
    }
fi

# Wait for ingress to be accessible (with auth header)
log_info "Waiting for ingress to be accessible..."
MAX_WAIT=60
WAITED=0
MCP_URL="http://dot-ai.127.0.0.1.nip.io:8180"
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf "${MCP_URL}/api/v1/tools/version" -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${TEST_AUTH_TOKEN}" \
        -d '{}' > /dev/null 2>&1; then
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

# Wait for agentic-tools plugin to be discovered by MCP server
log_info "Waiting for agentic-tools plugin discovery..."
PLUGIN_MAX_WAIT=120
PLUGIN_WAITED=0
while [ $PLUGIN_WAITED -lt $PLUGIN_MAX_WAIT ]; do
    PLUGIN_COUNT=$(curl -sf "${MCP_URL}/api/v1/tools/version" -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${TEST_AUTH_TOKEN}" \
        -d '{}' 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j?.data?.result?.system?.plugins?.pluginCount||0)}catch{console.log(0)}})" 2>/dev/null || echo "0")
    if [ "$PLUGIN_COUNT" -ge 1 ] 2>/dev/null; then
        log_info "Plugin discovery complete: ${PLUGIN_COUNT} plugin(s) available"
        break
    fi
    sleep 3
    PLUGIN_WAITED=$((PLUGIN_WAITED + 3))
done

if [ $PLUGIN_WAITED -ge $PLUGIN_MAX_WAIT ]; then
    log_error "Plugin discovery failed within ${PLUGIN_MAX_WAIT} seconds"
    curl -sf "${MCP_URL}/api/v1/tools/version" -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${TEST_AUTH_TOKEN}" \
        -d '{}' 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})" || true
    kubectl logs -n dot-ai -l app.kubernetes.io/name=dot-ai --tail=50
    exit 1
fi

# Export configuration for tests
export MCP_BASE_URL="${MCP_URL}"
export DOT_AI_AUTH_TOKEN="${TEST_AUTH_TOKEN}"

# Dex OAuth test credentials (PRD #380)
export DEX_TEST_USER_EMAIL="admin@dot-ai.local"
export DEX_TEST_USER_PASSWORD="${TEST_ADMIN_PASSWORD}"
export DEX_ISSUER_URL="http://dex.dot-ai.127.0.0.1.nip.io:8180"

# RBAC test credentials (PRD #392)
export DOT_AI_JWT_SECRET="${TEST_JWT_SECRET}"

# RBAC test infrastructure (PRD #392)
# SubjectAccessReview permission and DOT_AI_RBAC_ENABLED are now handled by
# the Helm chart via rbac.enforcement.enabled (Milestone 3).

# Export configuration so tests can validate server is using correct settings
export AI_PROVIDER
export USE_LOCAL_EMBEDDINGS
export DOT_AI_RBAC_ENABLED="${RBAC_ENABLED}"

# Create RBAC bindings for the Dex admin user (by email — SAR uses email as user field)
log_info "Creating RBAC bindings for Dex admin user (admin@dot-ai.local)..."
kubectl apply -f - <<RBAC_ADMIN_EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: dot-ai-test-admin
rules:
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["tools"]
    verbs: ["execute"]
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["users"]
    verbs: ["execute"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: dot-ai-test-admin-binding
subjects:
  - kind: User
    name: "admin@dot-ai.local"
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: dot-ai-test-admin
  apiGroup: rbac.authorization.k8s.io
RBAC_ADMIN_EOF

# Step 5: Run integration tests
log_info "Running integration tests (RBAC_ENABLED=${RBAC_ENABLED})..."
npx vitest run --config=vitest.integration.config.ts --test-timeout=1200000 "${TEST_ARGS[@]}"

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    log_info "Integration tests passed!"
else
    log_error "Integration tests failed!"
fi

exit $TEST_EXIT_CODE
