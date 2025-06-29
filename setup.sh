#!/bin/bash

# setup.sh - Kubernetes cluster setup for App-Agent development and testing
# This script creates a kind cluster with kubeconfig in the current directory
# and can be used both locally and in CI/CD environments

set -e  # Exit on any error

KUBECONFIG_PATH="$PWD/kubeconfig.yaml"
CLUSTER_NAME="app-agent-test"

echo "🚀 Setting up Kubernetes cluster for App-Agent..."

# Check if kind is available
if ! command -v kind &> /dev/null; then
    echo "❌ Error: kind is not installed"
    echo "Please install kind: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
    exit 1
fi

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ Error: kubectl is not installed"
    echo "Please install kubectl: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

# Check if helm is available
if ! command -v helm &> /dev/null; then
    echo "❌ Error: helm is not installed"
    echo "Please install helm: https://helm.sh/docs/intro/install/"
    exit 1
fi

# Clean up any existing cluster with the same name
echo "🧹 Cleaning up any existing cluster..."
kind delete cluster --name "$CLUSTER_NAME" 2>/dev/null || true

# Create new kind cluster with kubeconfig in current directory
echo "🏗️  Creating kind cluster..."
kind create cluster --name "$CLUSTER_NAME" --kubeconfig "$KUBECONFIG_PATH"

# Verify cluster is ready
echo "✅ Verifying cluster is ready..."
export KUBECONFIG="$KUBECONFIG_PATH"
kubectl cluster-info

# Wait for all system pods to be ready
echo "⏳ Waiting for system pods to be ready..."
kubectl wait --for=condition=Ready pods --all -n kube-system --timeout=300s

# Install Crossplane
echo "🔧 Installing Crossplane..."
helm repo add crossplane-stable https://charts.crossplane.io/stable 2>/dev/null || true
helm repo update
helm install crossplane crossplane-stable/crossplane --namespace crossplane-system --create-namespace --kubeconfig "$KUBECONFIG_PATH" --wait

# Apply Crossplane RBAC and providers
echo "🔐 Setting up Crossplane RBAC and providers..."
kubectl apply -f tests/fixtures/crossplane-rbac.yaml --kubeconfig "$KUBECONFIG_PATH"
kubectl apply -f tests/fixtures/crossplane-providers.yaml --kubeconfig "$KUBECONFIG_PATH"
kubectl apply -f tests/fixtures/crossplane-app-configuration.yaml --kubeconfig "$KUBECONFIG_PATH"

echo "🎉 Kubernetes cluster setup complete!"
echo "📁 Kubeconfig saved to: $KUBECONFIG_PATH"
echo "🔧 To use this cluster, run: export KUBECONFIG=$KUBECONFIG_PATH"

# Optional: Display cluster info
echo ""
echo "📊 Cluster Information:"
kubectl get nodes
echo ""
kubectl get pods -A --field-selector=status.phase!=Running 2>/dev/null | head -10 || echo "All pods are running ✅" 