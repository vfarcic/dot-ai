#!/usr/bin/env nu

# Builds a container image
def "main build image" [
    tag: string                                  # The tag of the image (e.g., 0.0.1)
    --registry = "ghcr.io"                       # Image registry (e.g., ghcr.io)
    --registry_user = "vfarcic"                  # Image registry user (e.g., vfarcic)
    --image = "silly-demo"                       # Image name (e.g., silly-demo)
    --builder = "docker"                         # Image builder; currently supported are: `docker` and `kaniko`
    --push = true                                # Whether to push the image to the registry
    --dockerfile = "Dockerfile"                  # Path to Dockerfile
    --context = "."                              # Path to the context
] {

    if $builder == "docker" {

        (
            docker image build
                --tag $"($registry)/($registry_user)/($image):latest"
                --tag $"($registry)/($registry_user)/($image):($tag)"
                --file $dockerfile
                $context
        )

        if $push {

            docker image push $"($registry)/($registry_user)/($image):latest"

            docker image push $"($registry)/($registry_user)/($image):($tag)"

        }

    } else if $builder == "kaniko" {

        (
            executor --dockerfile=Dockerfile --context=.
                $"--destination=($registry)/($registry_user)/($image):($tag)"
                $"--destination=($registry)/($registry_user)/($image):latest"
        )

    } else {

        echo $"Unsupported builder: ($builder)"

    } 

}

# Retrieves a container registry address
#
# Parameters:
# --container-registry: Container registry address (optional, falls back to CONTAINER_REGISTRY env var)
def "main get container_registry" [
    --container-registry: string
] {

    mut registry = $container_registry
    if ($registry | is-empty) and ("CONTAINER_REGISTRY" in $env) {
        $registry = $env.CONTAINER_REGISTRY
    } else if ($registry | is-empty) {
        error make { msg: "Container registry address required via --container-registry parameter or CONTAINER_REGISTRY environment variable" }
    }
    $"export CONTAINER_REGISTRY=($registry)\n" | save --append .env

    $registry

}
