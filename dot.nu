#!/usr/bin/env nu

source scripts/kubernetes.nu
source scripts/common.nu
source scripts/crossplane.nu
source scripts/ingress.nu
source scripts/mcp.nu
source scripts/anthropic.nu

def main [] {}

def "main setup" [--qdrant-tag: string = "latest"] {
    
    rm --force .env

    # let provider = main get provider --providers ["azure" "google"]

    let anthropic_data = main get anthropic

    mut openai_key = ""
    if "OPENAI_API_KEY" in $env {
        $openai_key = $env.OPENAI_API_KEY
    } else {
        let value = input $"(ansi green_bold)Enter OpenAI API key:(ansi reset) "
        $openai_key = $value
    }
    $"export OPENAI_API_KEY=($openai_key)\n" | save --append .env

    (
        docker container run --detach --name qdrant
            --publish 6333:6333
            $"ghcr.io/vfarcic/dot-ai-demo/qdrant:($qdrant_tag)"
    )

    main create kubernetes kind

    cp kubeconfig-dot.yaml kubeconfig.yaml

    main apply ingress nginx --provider kind

    (
        main apply crossplane --preview true --app-config true
            --db-config true
    )

    kubectl create namespace a-team

    kubectl create namespace b-team

    # (
    #     main apply mcp --location [".mcp.json"]
    #         --enable-dot-ai true
    #         --kubeconfig "./kubeconfig.yaml"
    # )

    main print source

}

def "main destroy" [] {

    main destroy kubernetes kind

    docker container rm qdrant --force

}
