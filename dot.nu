#!/usr/bin/env nu

source scripts/kubernetes.nu
source scripts/common.nu
source scripts/crossplane.nu
source scripts/ingress.nu
source scripts/mcp.nu
source scripts/anthropic.nu
source scripts/openai.nu
source scripts/kyverno.nu
source scripts/atlas.nu
source scripts/toolhive.nu
source scripts/jaeger.nu
source scripts/dot-ai.nu
source scripts/cnpg.nu

def main [] {}

def "main setup" [
    --dot-ai-tag: string = "0.168.0",
    --qdrant-run = false,
    --qdrant-tag: string = "latest",
    --dot-ai-kubernetes-enabled = true,
    --kyverno-enabled = true,
    --atlas-enabled = true,
    --toolhive-enabled = false,
    --crossplane-enabled = true,
    --crossplane-provider = none,    # Which provider to use. Available options are `none`, `google`, `aws`, and `azure`
    --crossplane-db-config = false,  # Whether to apply DOT SQL Crossplane Configuration
    --jaeger-enabled = false,
    --kubernetes-provider = "kind"
] {
    
    rm --force .env

    # let provider = main get provider --providers ["azure" "google"]

    let anthropic_data = main get anthropic
    let openai_data = main get openai

    let dot_ai_image = $"ghcr.io/vfarcic/dot-ai:($dot_ai_tag)"

    $"export DOT_AI_IMAGE=($dot_ai_image)\n" | save --append .env

    docker image pull $dot_ai_image

    let qdrant_image = $"ghcr.io/vfarcic/dot-ai-demo/qdrant:($qdrant_tag)"

    $"export QDRANT_IMAGE=($qdrant_image)\n" | save --append .env

    if $qdrant_run {

        docker image pull $qdrant_image

        docker container run --detach --name qdrant --publish 6333:6333 $qdrant_image

    }

    main create kubernetes $kubernetes_provider

    cp kubeconfig-dot.yaml kubeconfig.yaml

    main apply ingress nginx --provider kind
    
    if $crossplane_enabled {(
        main apply crossplane --app-config true --db-config true
            --provider $crossplane_provider
    )}

    kubectl create namespace a-team

    kubectl create namespace b-team

    if $kyverno_enabled {
        
        main apply kyverno

        kubectl apply --filename examples/policies
    }

    if $atlas_enabled {
        main apply atlas
    }

    if $jaeger_enabled {
        main apply jaeger "nginx" "jaeger.127.0.0.1.nip.io"
    }

    if $dot_ai_kubernetes_enabled {(
        main apply dot-ai
            --anthropic-api-key $anthropic_data.token
            --openai-api-key $openai_data.token
            --enable-tracing true
            --version $dot_ai_tag
    )}

    main print source

}

def "main destroy" [
    --qdrant-run = true,
] {

    main destroy kubernetes kind

    if $qdrant_run {
        docker container rm qdrant --force
        docker volume rm qdrant-data
    }

}

def "main build qdrant-image" [
    version: string,
    --container: string = "qdrant",
    --repo: string = "ghcr.io/vfarcic/dot-ai-demo/qdrant"
    --latest-version: string = "latest"
] {

    print "Extracting data from running Qdrant container..."

    # Remove existing qdrant_storage directory if it exists at root
    if (ls . | where name == "qdrant_storage" and type == "dir" | length) > 0 {
        rm --recursive --force qdrant_storage
    }

    # Extract data from the running Qdrant container to root directory
    docker container cp $"($container):/qdrant/storage" ./qdrant_storage
    
    # Verify the data was extracted successfully
    if (ls . | where name == "qdrant_storage" and type == "dir" | length) == 0 {
        error "Failed to extract qdrant_storage from container"
    }
    
    print $"Building multi-arch qdrant image with version ($version)..."
    docker buildx build --platform linux/amd64,linux/arm64 --file Dockerfile-qdrant --build-arg $"VERSION=($version)" --tag $"($repo):($version)" --tag $"($repo):($latest_version)" --push .

    print "Cleaning up extracted data files..."
    rm --recursive --force qdrant_storage

    print $"Multi-arch image built and pushed successfully: ($repo):($version) and ($repo):latest"
}
