#!/bin/bash

# Integration Test Cluster Setup
# Creates a dedicated Kind cluster for integration testing with operators pre-installed

set -e

CLUSTER_NAME="dot-test"
KUBECONFIG_PATH="$(pwd)/kubeconfig-test.yaml"
KIND_CONFIG="$(pwd)/tests/integration/infrastructure/kind-test.yaml"

echo "🚀 Setting up integration test cluster..."

# Check if Kind is installed
if ! command -v kind &> /dev/null; then
    echo "❌ Kind is not installed. Please install Kind first:"
    echo "   brew install kind"
    echo "   # or"
    echo "   go install sigs.k8s.io/kind@latest"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed. Please install kubectl first"
    exit 1
fi

# Delete existing test cluster if it exists
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
    echo "🧹 Deleting existing test cluster..."
    kind delete cluster --name="${CLUSTER_NAME}"
fi

# Remove existing test kubeconfig
if [[ -f "${KUBECONFIG_PATH}" ]]; then
    echo "🧹 Removing existing test kubeconfig..."
    rm "${KUBECONFIG_PATH}"
fi

echo "📋 Creating Kind cluster with config: ${KIND_CONFIG}"

# Create Kind cluster
kind create cluster \
    --name="${CLUSTER_NAME}" \
    --config="${KIND_CONFIG}" \
    --kubeconfig="${KUBECONFIG_PATH}"

echo "✅ Kind cluster created successfully"

# Set KUBECONFIG for subsequent commands
export KUBECONFIG="${KUBECONFIG_PATH}"

# Wait for cluster to be ready
echo "⏳ Waiting for cluster to be ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=120s

echo "📦 Installing CloudNativePG operator..."

# Install CloudNativePG operator
kubectl apply -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.20/releases/cnpg-1.20.0.yaml

# Wait for CNPG operator to be ready
echo "⏳ Waiting for CNPG operator to be ready..."
kubectl wait --for=condition=Available deployment/cnpg-controller-manager \
    --namespace=cnpg-system --timeout=120s

echo "📦 Installing Kyverno Policy Engine..."

# Check if Helm is installed
if ! command -v helm &> /dev/null; then
    echo "❌ Helm is not installed. Please install Helm first"
    exit 1
fi

# Add Kyverno Helm repository
helm repo add kyverno https://kyverno.github.io/kyverno
helm repo update

# Install Kyverno using Helm
helm upgrade --install kyverno kyverno/kyverno \
    --namespace kyverno --create-namespace \
    --wait --timeout=300s

echo "⏳ Waiting for Kyverno to be ready..."
kubectl wait --for=condition=Available deployment/kyverno-admission-controller \
    --namespace=kyverno --timeout=180s
kubectl wait --for=condition=Available deployment/kyverno-background-controller \
    --namespace=kyverno --timeout=180s
kubectl wait --for=condition=Available deployment/kyverno-cleanup-controller \
    --namespace=kyverno --timeout=180s
kubectl wait --for=condition=Available deployment/kyverno-reports-controller \
    --namespace=kyverno --timeout=180s

echo "📦 Starting Qdrant Vector Database (Docker)..."

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first"
    exit 1
fi

# Stop and remove existing Qdrant test container if it exists
if docker ps -a --format "table {{.Names}}" | grep -q "^qdrant-test$"; then
    echo "🧹 Removing existing Qdrant test container..."
    docker rm -f qdrant-test
fi

# Start Qdrant container on host with pre-populated test data
docker run -d \
    --name qdrant-test \
    -p 6333:6333 \
    ghcr.io/vfarcic/dot-ai-demo/qdrant:tests-latest

# Wait for Qdrant to be ready
echo "⏳ Waiting for Qdrant to be ready..."
sleep 5  # Give it a moment to start
for i in {1..30}; do
    if curl -f http://localhost:6333/ &> /dev/null; then
        echo "✅ Qdrant is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Timeout waiting for Qdrant to be ready"
        exit 1
    fi
    sleep 2
done

# Verify cluster is working
echo "🔍 Verifying cluster setup..."

# Check nodes
echo "Nodes:"
kubectl get nodes

# Check CNPG operator
echo "CNPG Operator:"
kubectl get pods -n cnpg-system

# Check if we can create namespaces
echo "Testing namespace creation..."
kubectl create namespace test-setup-verification
kubectl delete namespace test-setup-verification

echo ""
echo "✅ Integration test cluster setup complete!"
echo ""
echo "📝 Cluster Details:"
echo "   Cluster Name: ${CLUSTER_NAME}"
echo "   Kubeconfig: ${KUBECONFIG_PATH}"
echo "   Test Command: KUBECONFIG=${KUBECONFIG_PATH} kubectl get nodes"
echo ""
echo "🧪 Ready to run integration tests with:"
echo "   npm run test:integration"
echo ""