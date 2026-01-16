#!/bin/bash

# Reset ResourceSyncConfig and CapabilityScanConfig
# This script:
# 1. Deletes ResourceSyncConfig and CapabilityScanConfig CRs from the cluster
# 2. Deletes all capabilities data via MCP API
# 3. Re-applies the CRs in the dot-ai namespace
#
# Usage:
#   ./scripts/reset-sync-and-scan-test-cluster.sh

set -e

# Configuration - defaults match test cluster settings
KUBECONFIG="${KUBECONFIG:-./kubeconfig-test.yaml}"
export KUBECONFIG

NAMESPACE="${NAMESPACE:-dot-ai}"
MCP_URL="${MCP_URL:-http://dot-ai.127.0.0.1.nip.io:8180}"
AUTH_TOKEN="${AUTH_TOKEN:-test-auth-token-integration}"
RESOURCE_SYNC_NAME="${RESOURCE_SYNC_NAME:-default-sync}"
CAPABILITY_SCAN_NAME="${CAPABILITY_SCAN_NAME:-default-scan}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Reset ResourceSyncConfig and CapabilityScanConfig ===${NC}"
echo "Kubeconfig: $KUBECONFIG"
echo "Namespace: $NAMESPACE"
echo "MCP URL: $MCP_URL"
echo ""

# Step 1: Delete existing CRs
echo -e "${YELLOW}Step 1: Deleting existing CRs...${NC}"

if kubectl get resourcesyncconfig "$RESOURCE_SYNC_NAME" -n "$NAMESPACE" &>/dev/null; then
    echo "Deleting ResourceSyncConfig/$RESOURCE_SYNC_NAME..."
    kubectl delete resourcesyncconfig "$RESOURCE_SYNC_NAME" -n "$NAMESPACE" --ignore-not-found
    echo -e "${GREEN}ResourceSyncConfig deleted${NC}"
else
    echo "ResourceSyncConfig/$RESOURCE_SYNC_NAME not found, skipping..."
fi

if kubectl get capabilityscanconfig "$CAPABILITY_SCAN_NAME" -n "$NAMESPACE" &>/dev/null; then
    echo "Deleting CapabilityScanConfig/$CAPABILITY_SCAN_NAME..."
    kubectl delete capabilityscanconfig "$CAPABILITY_SCAN_NAME" -n "$NAMESPACE" --ignore-not-found
    echo -e "${GREEN}CapabilityScanConfig deleted${NC}"
else
    echo "CapabilityScanConfig/$CAPABILITY_SCAN_NAME not found, skipping..."
fi

echo ""

# Step 2: Delete all capabilities via MCP API
echo -e "${YELLOW}Step 2: Deleting all capabilities via MCP API...${NC}"

response=$(curl -s -X POST "$MCP_URL/api/v1/tools/manageOrgData" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d '{"dataType": "capabilities", "operation": "deleteAll"}')

if echo "$response" | grep -q '"success":true'; then
    echo -e "${GREEN}All capabilities deleted${NC}"
else
    echo -e "${RED}Failed to delete capabilities: $response${NC}"
fi

echo ""

# Step 3: Apply the CRs
echo -e "${YELLOW}Step 3: Applying CRs to namespace $NAMESPACE...${NC}"

# Create ResourceSyncConfig
echo "Creating ResourceSyncConfig..."
cat <<EOF | kubectl apply -f -
apiVersion: dot-ai.devopstoolkit.live/v1alpha1
kind: ResourceSyncConfig
metadata:
  name: $RESOURCE_SYNC_NAME
  namespace: $NAMESPACE
spec:
  mcpEndpoint: http://dot-ai.$NAMESPACE.svc.cluster.local:3456/api/v1/resources/sync
  mcpAuthSecretRef:
    name: dot-ai-secrets
    key: auth-token
  debounceWindowSeconds: 10
  resyncIntervalMinutes: 60
EOF
echo -e "${GREEN}ResourceSyncConfig created${NC}"

# Create CapabilityScanConfig
echo "Creating CapabilityScanConfig..."
cat <<EOF | kubectl apply -f -
apiVersion: dot-ai.devopstoolkit.live/v1alpha1
kind: CapabilityScanConfig
metadata:
  name: $CAPABILITY_SCAN_NAME
  namespace: $NAMESPACE
spec:
  mcp:
    endpoint: http://dot-ai.$NAMESPACE.svc.cluster.local:3456/api/v1/tools/manageOrgData
    authSecretRef:
      name: dot-ai-secrets
      key: auth-token
EOF
echo -e "${GREEN}CapabilityScanConfig created${NC}"

echo ""
echo -e "${GREEN}=== Reset complete ===${NC}"
echo ""
echo "The controller will now:"
echo "  - Start syncing resources to the 'resources' collection"
echo "  - Start scanning capabilities to the 'capabilities' collection"
echo ""
echo "Monitor progress with:"
echo "  kubectl get resourcesyncconfig $RESOURCE_SYNC_NAME -n $NAMESPACE -o yaml"
echo "  kubectl get capabilityscanconfig $CAPABILITY_SCAN_NAME -n $NAMESPACE -o yaml"
