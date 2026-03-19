#!/usr/bin/env bash

# Infrastructure profiles for per-test-file cluster setup.
# Maps a test name to the set of optional components it needs.
#
# Usage (in run-integration-tests.sh):
#   source infra-profiles.sh
#   apply_profile "version"
#
# Adding a new test: add a case line if it needs extra infra.
# Tests not listed here get base infra only (KinD, ingress, Qdrant, Dex, dot-ai, agentic-tools).

apply_profile() {
    # Default: skip all optional infrastructure
    export SKIP_CNPG=true
    export SKIP_KYVERNO=true
    export SKIP_PROMETHEUS_MCP=true
    export SKIP_ARGOCD=true
    export SKIP_FLUX=true

    case "$1" in
        version)
            SKIP_KYVERNO=false
            SKIP_PROMETHEUS_MCP=false
            ;;
        remediate)
            SKIP_PROMETHEUS_MCP=false
            SKIP_ARGOCD=false
            SKIP_FLUX=false
            ;;
        recommend)
            SKIP_ARGOCD=false
            ;;
        query)
            SKIP_CNPG=false
            ;;
        manage-org-data-policies)
            SKIP_KYVERNO=false
            ;;
        # All others: base infra only
    esac
}
