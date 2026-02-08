#!/usr/bin/env nu

# Installs Grafana and Prometheus with Kubernetes dashboards
#
# Installs kube-prometheus-stack which includes Grafana with Prometheus
# as a data source, Prometheus configured to scrape Kubernetes metrics,
# and common Kubernetes dashboards.
#
# Examples:
# > main apply grafana-stack traefik 127.0.0.1.nip.io
def "main apply grafana-stack" [
    ingress_class: string, # The Ingress class to use
    ingress_host: string   # The base hostname for Ingress
] {

    print $"\nInstalling (ansi yellow_bold)Grafana Stack(ansi reset)...\n"

    let values = {
        grafana: {
            ingress: {
                enabled: true
                ingressClassName: $ingress_class
                hosts: [$"grafana.($ingress_host)"]
            }
            defaultDashboardsEnabled: true
            defaultDashboardsTimezone: utc
            sidecar: {
                dashboards: {
                    enabled: true
                    searchNamespace: ALL
                }
                datasources: {
                    enabled: true
                }
            }
            dashboardProviders: {
                "dashboardproviders.yaml": {
                    apiVersion: 1
                    providers: [{
                        name: grafana-dashboards-kubernetes
                        orgId: 1
                        folder: Kubernetes
                        type: file
                        disableDeletion: true
                        editable: false
                        options: {
                            path: /var/lib/grafana/dashboards/grafana-dashboards-kubernetes
                        }
                    }]
                }
            }
            dashboards: {
                grafana-dashboards-kubernetes: {
                    k8s-views-global: {
                        url: "https://raw.githubusercontent.com/dotdc/grafana-dashboards-kubernetes/master/dashboards/k8s-views-global.json"
                        datasource: Prometheus
                    }
                    k8s-views-namespaces: {
                        url: "https://raw.githubusercontent.com/dotdc/grafana-dashboards-kubernetes/master/dashboards/k8s-views-namespaces.json"
                        datasource: Prometheus
                    }
                    k8s-views-nodes: {
                        url: "https://raw.githubusercontent.com/dotdc/grafana-dashboards-kubernetes/master/dashboards/k8s-views-nodes.json"
                        datasource: Prometheus
                    }
                    k8s-views-pods: {
                        url: "https://raw.githubusercontent.com/dotdc/grafana-dashboards-kubernetes/master/dashboards/k8s-views-pods.json"
                        datasource: Prometheus
                    }
                    k8s-system-api-server: {
                        url: "https://raw.githubusercontent.com/dotdc/grafana-dashboards-kubernetes/master/dashboards/k8s-system-api-server.json"
                        datasource: Prometheus
                    }
                    k8s-system-coredns: {
                        url: "https://raw.githubusercontent.com/dotdc/grafana-dashboards-kubernetes/master/dashboards/k8s-system-coredns.json"
                        datasource: Prometheus
                    }
                }
            }
        }
        prometheus: {
            ingress: {
                enabled: true
                ingressClassName: $ingress_class
                hosts: [$"prometheus.($ingress_host)"]
            }
            prometheusSpec: {
                serviceMonitorSelectorNilUsesHelmValues: false
                podMonitorSelectorNilUsesHelmValues: false
            }
        }
    }

    $values | to yaml | save values-grafana-stack.yaml --force

    (
        helm upgrade --install
            kube-prometheus-stack kube-prometheus-stack
            --repo https://prometheus-community.github.io/helm-charts
            --values values-grafana-stack.yaml
            --namespace monitoring --create-namespace
            --wait
    )

    rm values-grafana-stack.yaml

    print $"\nGrafana is available at (ansi yellow_bold)http://grafana.($ingress_host)(ansi reset)"
    print $"Prometheus is available at (ansi yellow_bold)http://prometheus.($ingress_host)(ansi reset)"
    print $"\nDefault Grafana credentials: admin / prom-operator"
    print $"\nIncluded Kubernetes dashboards:"
    print $"  - K8s Views Global"
    print $"  - K8s Views Namespaces"
    print $"  - K8s Views Nodes"
    print $"  - K8s Views Pods"
    print $"  - K8s System API Server"
    print $"  - K8s System CoreDNS"

}
