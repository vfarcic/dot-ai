#!/usr/bin/env nu

# Installs Jaeger with ingress configuration
#
# Examples:
# > main apply jaeger nginx jaeger.example.com
def "main apply jaeger" [
    ingress_class: string,
    ingress_host: string
] {

    helm repo add jaegertracing https://jaegertracing.github.io/helm-charts

    helm repo update

    (
        helm upgrade --install jaeger jaegertracing/jaeger
            --namespace observability --create-namespace
            --set provisionDataStore.cassandra=false
            --set jaeger.enabled=true
            --set jaeger.ingress.enabled=true
            --set $"jaeger.ingress.ingressClassName=($ingress_class)"
            --set $"jaeger.ingress.hosts[0]=($ingress_host)"
            --set storage.type=memory
            --wait
    )

    # Fix Helm chart bug: ingress references jaeger-query but service is named jaeger
    (
        kubectl patch ingress jaeger -n observability
            --type='json'
            -p='[{"op": "replace", "path": "/spec/rules/0/http/paths/0/backend/service/name", "value": "jaeger"}]'
    )

    print $"Jaeger is available at (ansi yellow_bold)http://($ingress_host)(ansi reset)"

}
