#!/bin/bash

# Integration Test Cluster Teardown
# Destroys the dedicated Kind test cluster and cleans up resources

set -e

CLUSTER_NAME="dot-ai-test"
KUBECONFIG_PATH="$(pwd)/kubeconfig-test.yaml"

echo "🧹 Tearing down integration test cluster..."

# Check if Kind is installed
if ! command -v kind &> /dev/null; then
    echo "❌ Kind is not installed"
    exit 1
fi

# Delete Kind cluster if it exists
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
    echo "🗑️  Deleting Kind cluster: ${CLUSTER_NAME}"
    # Use --kubeconfig to avoid touching the user's main kubeconfig (which may be malformed)
    if kind delete cluster --name="${CLUSTER_NAME}" --kubeconfig="${KUBECONFIG_PATH}" 2>/dev/null || \
       kind delete cluster --name="${CLUSTER_NAME}" 2>/dev/null; then
        echo "✅ Cluster deleted successfully"
    else
        echo "⚠️  Could not delete cluster (may already be gone)"
    fi
else
    echo "ℹ️  Cluster ${CLUSTER_NAME} does not exist"
fi

# Remove test kubeconfig if it exists
if [[ -f "${KUBECONFIG_PATH}" ]]; then
    echo "🗑️  Removing test kubeconfig: ${KUBECONFIG_PATH}"
    rm "${KUBECONFIG_PATH}"
    echo "✅ Kubeconfig removed successfully"
else
    echo "ℹ️  Test kubeconfig does not exist"
fi

# Clean up Qdrant Docker container
if docker ps -a --format "table {{.Names}}" | grep -q "^qdrant-test$"; then
    echo "🗑️  Removing Qdrant test container..."
    docker rm -f qdrant-test
    echo "✅ Qdrant container removed successfully"
else
    echo "ℹ️  Qdrant test container does not exist"
fi

# Clean up any remaining test namespaces (in case of cleanup failures)
echo "🧹 Cleaning up any remaining test resources..."

# List any Kind clusters that might be test-related
echo "Remaining Kind clusters:"
kind get clusters || echo "No Kind clusters found"

echo ""
echo "✅ Integration test cluster teardown complete!"
echo ""