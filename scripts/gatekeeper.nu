#!/usr/bin/env nu

# Installs Gatekeeper (Open Policy Agent) for Kubernetes policy enforcement
def "main apply opa" [] {

    (
        helm repo add gatekeeper
            https://open-policy-agent.github.io/gatekeeper/charts
    )

    helm repo update

    (
        helm upgrade --install gatekeeper gatekeeper/gatekeeper 
            --namespace gatekeeper-system --create-namespace
            --wait
    )

}
