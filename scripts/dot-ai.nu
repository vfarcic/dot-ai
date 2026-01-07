#!/usr/bin/env nu

# Installs DevOps AI Toolkit stack (MCP server, controller, and UI)
#
# Examples:
# > main apply dot-ai --host dot-ai.127.0.0.1.nip.io
# > main apply dot-ai --provider openai --model gpt-4o
# > main apply dot-ai --enable-tracing true
def "main apply dot-ai" [
    --stack-version = "0.10.0",
    --anthropic-api-key = "",
    --openai-api-key = "",
    --auth-token = "my-secret-token",
    --provider = "anthropic",
    --model = "claude-haiku-4-5-20251001",
    --ingress-enabled = true,
    --ingress-class = "nginx",
    --host = "dot-ai.127.0.0.1.nip.io",
    --ui-host = "dot-ai-ui.127.0.0.1.nip.io",
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
            --set 'dot-ai.extraEnv[0].name=OTEL_TRACING_ENABLED'
            --set-string 'dot-ai.extraEnv[0].value=true'
            --set 'dot-ai.extraEnv[1].name=OTEL_EXPORTER_OTLP_ENDPOINT'
            --set 'dot-ai.extraEnv[1].value=http://jaeger.observability.svc.cluster.local:4318/v1/traces'
            --set 'dot-ai.extraEnv[2].name=OTEL_SERVICE_NAME'
            --set 'dot-ai.extraEnv[2].value=dot-ai-mcp'
        ]
    } else {
        []
    }

    (
        helm upgrade --install dot-ai-stack
            $"oci://ghcr.io/vfarcic/dot-ai-stack/charts/dot-ai-stack:($stack_version)"
            --set $"dot-ai.secrets.anthropic.apiKey=($anthropic_key)"
            --set $"dot-ai.secrets.openai.apiKey=($openai_key)"
            --set $"dot-ai.secrets.auth.token=($auth_token)"
            --set $"dot-ai.ai.provider=($provider)"
            --set $"dot-ai.ai.model=($model)"
            --set $"dot-ai.ingress.enabled=($ingress_enabled)"
            --set $"dot-ai.ingress.className=($ingress_class)"
            --set $"dot-ai.ingress.host=($host)"
            --set $"dot-ai-ui.ingress.enabled=($ingress_enabled)"
            --set $"dot-ai-ui.ingress.host=($ui_host)"
            ...$tracing_flags
            --namespace dot-ai --create-namespace
            --wait
    )

    print $"DevOps AI Toolkit is available at (ansi yellow_bold)http://($host)(ansi reset)"
    print $"DevOps AI UI is available at (ansi yellow_bold)http://($ui_host)(ansi reset)"

    # Update .env with auth token for MCP clients
    $"export DOT_AI_AUTH_TOKEN=($auth_token)\n" | save --append .env

    if $enable_tracing {
        print $"Tracing enabled: Traces will be sent to (ansi yellow_bold)Jaeger in observability namespace(ansi reset)"
    }

}
