#!/usr/bin/env nu

# Installs Argo Workflows with container registry credentials
#
# Examples:
# > main apply argoworkflows my-user my-password user@example.com --registry ghcr.io
def "main apply argoworkflows" [
    registry_user: string     # Container image registry user
    registry_password: string # Container image registry password
    registry_email: string    # Container image registry email
    --registry = "ghcr.io"    # Container image registry
] {

    kubectl create namespace argo

    (
        kubectl --namespace argo apply 
            --filename "https://github.com/argoproj/argo-workflows/releases/download/v3.6.0/quick-start-minimal.yaml"
    )

    let auth = ( $"($registry_user):($registry_password)" | base64 )

    let json = {
        "auths": {
            $"($registry)": {
                "auth": $"($auth)"
            }
        }
    } | to json

    (
        kubectl --namespace argo create secret
            docker-registry regcred
            $"--docker-server=($registry)"
            --docker-username=($registry_user)
            --docker-password=($registry_password)
            --docker-email=($registry_email)
    )
    
    (
        kubectl --namespace argo create secret
            generic registry-creds
            --from-literal $"password=($registry_password)"
            --from-literal $"config.json=($json)"
    )

}
