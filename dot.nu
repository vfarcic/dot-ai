#!/usr/bin/env nu

source scripts/kubernetes.nu
source scripts/common.nu
source scripts/crossplane.nu
source scripts/ingress.nu
source scripts/mcp.nu
source scripts/anthropic.nu

def main [] {}

def "main setup" [] {
    
    rm --force .env

    # let provider = main get provider --providers ["azure" "google"]

    let anthropic_data = main get anthropic

    main create kubernetes kind

    cp kubeconfig-dot.yaml kubeconfig.yaml

    main apply ingress nginx --provider kind

    # (
    #     main apply crossplane --provider $provider
    #         --preview true --app-config true --db-config true
    # )
    main apply crossplane --preview true --app-config true

    kubectl create namespace a-team

    kubectl create namespace b-team

    (
        main apply mcp --location [".mcp.json"]
            --enable-dot-ai true
            --kubeconfig "./kubeconfig.yaml"
    )

    main print source

}

def "main destroy" [] {

    main destroy kubernetes kind

}
