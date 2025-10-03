#!/usr/bin/env nu

# Installs cert-manager for managing TLS certificates in Kubernetes
def "main apply certmanager" [] {

    (
        helm upgrade --install cert-manager cert-manager
            --repo https://charts.jetstack.io
            --namespace cert-manager --create-namespace
            --set crds.enabled=true --wait
    )

}