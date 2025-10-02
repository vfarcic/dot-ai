#!/usr/bin/env nu

def apply_prometheus [ingress_class: string, ingress_host: string] {

    open values-prometheus.yaml
        | upsert grafana.ingress.ingressClassName $ingress_class
        | upsert grafana.ingress.hosts.0 $"grafana.($ingress_host)"
        | upsert prometheus.ingress.ingressClassName $ingress_class
        | upsert prometheus.ingress.hosts.0 $"prometheus.($ingress_host)"
        | save values-prometheus.yaml --force

    (
        helm upgrade --install
            kube-prometheus-stack kube-prometheus-stack
            --repo https://prometheus-community.github.io/helm-charts
            --values values-prometheus.yaml
            --namespace prometheus-system --create-namespace
            --wait
    )

}