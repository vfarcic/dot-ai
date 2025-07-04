#!/bin/bash

# destroy.sh - Cleanup script for DevOps AI Toolkit Kubernetes cluster
# This script destroys the kind cluster and cleans up resources created by setup.sh

set -e  # Exit on any error

KUBECONFIG_PATH="$PWD/kubeconfig.yaml"
CLUSTER_NAME="dot-ai-test"

echo "🧹 Destroying DevOps AI Toolkit Kubernetes cluster..."

# Check if kind is available
if ! command -v kind &> /dev/null; then
    echo "❌ Error: kind is not installed"
    echo "Cannot destroy cluster without kind CLI tool"
    exit 1
fi

# Delete the kind cluster
echo "🗑️  Deleting kind cluster '$CLUSTER_NAME'..."
if kind get clusters | grep -q "^$CLUSTER_NAME$"; then
    kind delete cluster --name "$CLUSTER_NAME"
    echo "✅ Cluster '$CLUSTER_NAME' deleted successfully"
else
    echo "ℹ️  Cluster '$CLUSTER_NAME' not found (may already be deleted)"
fi

# Remove kubeconfig file
if [ -f "$KUBECONFIG_PATH" ]; then
    echo "🗑️  Removing kubeconfig file..."
    rm -f "$KUBECONFIG_PATH"
    echo "✅ Kubeconfig file '$KUBECONFIG_PATH' removed"
else
    echo "ℹ️  Kubeconfig file '$KUBECONFIG_PATH' not found"
fi

# Clean up any helm repositories that were added (optional cleanup)
echo "🧹 Cleaning up helm repositories..."
helm repo remove crossplane-stable 2>/dev/null || echo "ℹ️  crossplane-stable repo not found"
helm repo remove crossplane-preview 2>/dev/null || echo "ℹ️  crossplane-preview repo not found"

echo "🎉 Cleanup complete!"
echo "💡 If you had KUBECONFIG exported, you may want to unset it:"
echo "   unset KUBECONFIG"