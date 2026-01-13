#!/bin/bash
# Find all MCP servers in a Kubernetes cluster and their related resources
#
# Usage: ./find-mcp-servers.sh [search-term]
#   search-term: Optional custom search term (default: "mcp")

set -uo pipefail

SEARCH_TERM="${1:-mcp}"

# Find namespaces containing matching resources
NAMESPACES=$(kubectl get pods -A --no-headers 2>/dev/null | grep -i "$SEARCH_TERM" | awk '{print $1}' | sort -u)

if [ -z "$NAMESPACES" ]; then
    kubectl api-resources --verbs=list -o name | grep -v "^events" | while read resource; do
        kubectl get "$resource" -A --no-headers 2>/dev/null | grep -i "$SEARCH_TERM"
    done
    exit 0
fi

# Get all resources in matching namespaces
for ns in $NAMESPACES; do
    kubectl get all,configmap,secret,ingress,pvc,sa -n "$ns" --no-headers 2>/dev/null | grep -i "$SEARCH_TERM"
done

# Find related resources by app labels
for ns in $NAMESPACES; do
    APP_LABELS=$(kubectl get deploy -n "$ns" -o jsonpath='{range .items[*]}{.metadata.labels.app}{"\n"}{end}' 2>/dev/null | grep -i "$SEARCH_TERM" | sort -u)
    for label in $APP_LABELS; do
        [ -n "$label" ] && kubectl get all,configmap,secret,ingress,pvc,sa -n "$ns" -l "app=$label" --no-headers 2>/dev/null
    done
done | sort -u

exit 0
