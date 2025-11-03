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
            --set allInOne.enabled=true
            --set allInOne.ingress.enabled=true
            --set $"allInOne.ingress.ingressClassName=($ingress_class)"
            --set $"allInOne.ingress.hosts[0]=($ingress_host)"
            --set storage.type=memory
            --set agent.enabled=false
            --set collector.enabled=false
            --set query.enabled=false
            --wait
    )

    print $"Jaeger is available at (ansi yellow_bold)http://($ingress_host)(ansi reset)"

}
