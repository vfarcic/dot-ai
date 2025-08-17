#!/usr/bin/env nu

source scripts/kubernetes.nu
source scripts/common.nu
source scripts/crossplane.nu
source scripts/ingress.nu
source scripts/mcp.nu
source scripts/anthropic.nu
source scripts/toolhive.nu

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
    $"export QDRANT_IMAGE=ghcr.io/vfarcic/dot-ai-demo/qdrant\n" | save --append .env

    main create kubernetes kind

    cp kubeconfig-dot.yaml kubeconfig.yaml

    main apply ingress nginx --provider kind

    main apply crossplane --app-config true --db-config true

    kubectl create namespace a-team

    kubectl create namespace b-team

    main apply toolhive

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

def "main build-image" [version: string] {
    
    let repo = "ghcr.io/vfarcic/dot-ai-demo/qdrant"
    
    print "Extracting data from running Qdrant container..."
    
    # Create tmp directory if it doesn't exist
    mkdir tmp
    
    # Remove existing qdrant_storage directory if it exists
    if (ls tmp | where name == "tmp/qdrant_storage" | length) > 0 {
        rm --recursive --force tmp/qdrant_storage
    }
    
    # Extract data from the running Qdrant container
    docker container cp qdrant:/qdrant/storage ./tmp/qdrant_storage
    
    print $"Building qdrant image with version ($version)..."
    docker image build --file Dockerfile-qdrant --build-arg $"VERSION=($version)" --tag $"($repo):($version)" --tag $"($repo):latest" .
    
    print "Cleaning up extracted data files..."
    rm --recursive --force tmp/qdrant_storage
    
    print $"Pushing qdrant image..."
    docker image push $"($repo):($version)"
    docker image push $"($repo):latest"
    
    print $"Image pushed successfully: ($repo):($version) and ($repo):latest"
}
