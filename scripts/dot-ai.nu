#!/usr/bin/env nu

# Installs DevOps AI Controller
#
# Examples:
# > main apply dot-ai-controller
# > main apply dot-ai-controller --controller-version 0.17.0
def "main apply dot-ai-controller" [
    --controller-version = "0.39.0"
] {

    (
        helm upgrade --install dot-ai-controller
            $"oci://ghcr.io/vfarcic/dot-ai-controller/charts/dot-ai-controller:($controller_version)"
            --namespace dot-ai --create-namespace
            --wait
    )

    # Create CapabilityScanConfig for autonomous capability discovery
    "apiVersion: dot-ai.devopstoolkit.live/v1alpha1
kind: CapabilityScanConfig
metadata:
  name: default-scan
  namespace: dot-ai
spec:
  mcp:
    endpoint: http://dot-ai-mcp.dot-ai.svc.cluster.local:3456/api/v1/tools/manageOrgData
    authSecretRef:
      name: dot-ai-secrets
      key: auth-token
" | kubectl apply --filename -

    # Create ResourceSyncConfig for semantic search across cluster resources
    "apiVersion: dot-ai.devopstoolkit.live/v1alpha1
kind: ResourceSyncConfig
metadata:
  name: default-sync
  namespace: dot-ai
spec:
  mcpEndpoint: http://dot-ai-mcp.dot-ai.svc.cluster.local:3456/api/v1/resources/sync
  mcpAuthSecretRef:
    name: dot-ai-secrets
    key: auth-token
  debounceWindowSeconds: 10
  resyncIntervalMinutes: 60
" | kubectl apply --filename -

    print $"DevOps AI Controller (ansi yellow_bold)($controller_version)(ansi reset) installed in (ansi yellow_bold)dot-ai(ansi reset) namespace"
    print $"CapabilityScanConfig created for autonomous capability discovery"
    print $"ResourceSyncConfig created for semantic search across cluster resources"

}

# Installs DevOps AI Toolkit with MCP server support and controller
#
# Examples:
# > main apply dot-ai --host dot-ai.127.0.0.1.nip.io
# > main apply dot-ai --provider openai --model gpt-4o
# > main apply dot-ai --enable-tracing true
def "main apply dot-ai" [
    --anthropic-api-key = "",
    --openai-api-key = "",
    --auth-token = "my-secret-token",
    --provider = "anthropic",
    --model = "claude-haiku-4-5-20251001",
    --ingress-enabled = true,
    --ingress-class = "nginx",
    --host = "dot-ai.127.0.0.1.nip.io",
    --version = "0.179.0",
    --controller-version = "0.39.0",
    --enable-tracing = false
] {

    let anthropic_key = if ($anthropic_api_key | is-empty) {
        $env.ANTHROPIC_API_KEY? | default ""
    } else {
        $anthropic_api_key
    }

    let openai_key = if ($openai_api_key | is-empty) {
        $env.OPENAI_API_KEY? | default ""
    } else {
        $openai_api_key
    }

    let tracing_flags = if $enable_tracing {
        [
            --set 'extraEnv[0].name=OTEL_TRACING_ENABLED'
            --set-string 'extraEnv[0].value=true'
            --set 'extraEnv[1].name=OTEL_EXPORTER_OTLP_ENDPOINT'
            --set 'extraEnv[1].value=http://jaeger-collector.observability.svc.cluster.local:4318/v1/traces'
            --set 'extraEnv[2].name=OTEL_SERVICE_NAME'
            --set 'extraEnv[2].value=dot-ai-mcp'
        ]
    } else {
        []
    }

    # Install MCP first (creates service and secrets needed by controller's CapabilityScanConfig)
    (
        helm upgrade --install dot-ai-mcp
            $"oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:($version)"
            --set $"secrets.anthropic.apiKey=($anthropic_key)"
            --set $"secrets.openai.apiKey=($openai_key)"
            --set $"secrets.auth.token=($auth_token)"
            --set $"ai.provider=($provider)"
            --set $"ai.model=($model)"
            --set $"ingress.enabled=($ingress_enabled)"
            --set $"ingress.className=($ingress_class)"
            --set $"ingress.host=($host)"
            --set "controller.enabled=true"
            ...$tracing_flags
            --namespace dot-ai --create-namespace
            --wait
    )

    # Install controller after MCP (CapabilityScanConfig references MCP service and secrets)
    main apply dot-ai-controller --controller-version $controller_version

    print $"DevOps AI Toolkit is available at (ansi yellow_bold)http://($host)(ansi reset)"

    # Update .env with auth token for MCP clients
    $"DOT_AI_AUTH_TOKEN=($auth_token)\n" | save --force .env

    if $enable_tracing {
        print $"Tracing enabled: Traces will be sent to (ansi yellow_bold)Jaeger in observability namespace(ansi reset)"
    }

}
