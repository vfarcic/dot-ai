#!/usr/bin/env nu

# Installs ArgoCD with optional ingress and applications setup
#
# Examples:
# > main apply argocd --host_name argocd.example.com --ingress_class_name nginx
def "main apply argocd" [
    --host-name = "",
    --apply-apps = true,
    --ingress-class-name = "traefik"
] {

    let git_url = git config --get remote.origin.url

    {
        configs: {
            secret: {
                argocdServerAdminPassword: "$2a$10$m3eTlEdRen0nS86c5Zph5u/bDFQMcWZYdG3NVdiyaACCqoxLJaz16"
                argocdServerAdminPasswordMtime: "2021-11-08T15:04:05Z"
            }
            cm: {
                application.resourceTrackingMethod: annotation
                timeout.reconciliation: 60s
            }
            params: { "server.insecure": true }
        }
        server: {
            ingress: {
                enabled: true
                ingressClassName: $ingress_class_name
                hostname: $host_name
            }
            extraArgs: [
                --insecure
            ]
        }
    } | save argocd-values.yaml --force

    helm repo add argo https://argoproj.github.io/argo-helm

    helm repo update
  
    (
        helm upgrade --install argocd argo/argo-cd
            --namespace argocd --create-namespace
            --values argocd-values.yaml --wait
    )

    mkdir argocd

    {
        apiVersion: argoproj.io/v1alpha1
        kind: Application
        metadata: {
            name: apps
            namespace: argocd
        }
        spec: {
            project: default
            source: {
                repoURL: $git_url
                targetRevision: HEAD
                path: apps
            }
            destination: {
                server: "https://kubernetes.default.svc"
                namespace: a-team
            }
            syncPolicy: {
                automated: {
                    selfHeal: true
                    prune: true
                    allowEmpty: true
                }
            }
        }
    } | save argocd/app.yaml --force

    if $apply_apps {
        
        kubectl apply --filename argocd/app.yaml

    }

}
