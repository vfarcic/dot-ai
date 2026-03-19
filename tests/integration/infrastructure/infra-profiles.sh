#!/usr/bin/env bash

# Infrastructure profiles for per-test-file cluster setup.
# Maps a test name to the set of optional components it needs.
#
# Usage (in run-integration-tests.sh):
#   source infra-profiles.sh
#   init_profiles                  # set defaults once
#   apply_profile "test1"          # enable infra for test1
#   apply_profile "test2"          # union: also enable infra for test2
#
# Adding a new test: add a case line if it needs extra infra.
# Tests not listed here get base infra only (KinD, ingress, Qdrant, Dex, dot-ai, agentic-tools).

# Set all optional infrastructure to skip (call once before applying profiles)
init_profiles() {
    export SKIP_CNPG=true
    export SKIP_KYVERNO=true
    export SKIP_PROMETHEUS_MCP=true
    export SKIP_ARGOCD=true
    export SKIP_FLUX=true
}

# Enable infrastructure for a specific test (only sets flags to false, never back to true)
apply_profile() {
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
            SKIP_CNPG=false
            ;;
        query)
            SKIP_CNPG=false
            SKIP_PROMETHEUS_MCP=false
            ;;
        manage-org-data-policies)
            SKIP_KYVERNO=false
            ;;
        manage-org-data-capabilities)
            SKIP_CNPG=false
            ;;
        # All others: base infra only
    esac
}
