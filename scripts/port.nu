#!/usr/bin/env nu

# Installs Port.io for software catalog management
#
# Examples:
# > main apply port myuser my-repo
def "main apply port" [
    github_user: string
    github_repo: string
] {

    start "https://getport.io"
    
    print $"
(ansi yellow_bold)Sign Up(ansi reset) \(if not already registered\) and (ansi yellow_bold)Log In(ansi reset) to Port.
Press any key to continue.
"
    input

    mut port_client_id = ""
    if "PORT_CLIENT_ID" not-in $env {
        $port_client_id = input $"(ansi green_bold)Enter Port Client ID:(ansi reset)"
    } else {
        $port_client_id = $env.PORT_CLIENT_ID
    }
    $"export PORT_CLIENT_ID=($port_client_id)\n"
        | save --append .env

    mut port_client_secret = ""
    if "PORT_CLIENT_ID" not-in $env {
        $port_client_secret = input $"(ansi green_bold)Enter Port Client Secret:(ansi reset)"
    } else {
        $port_client_secret = $env.PORT_CLIENT_SECRET
    }
    $"export PORT_CLIENT_SECRET=($port_client_secret)\n"
        | save --append .env

    print $"
Install (ansi green_bold)Port's GitHub app(ansi reset).
Open https://docs.getport.io/build-your-software-catalog/sync-data-to-catalog/git/github/#installation for more information.
Press any key to continue.
"
    input

    (
        helm upgrade --install port-k8s-exporter port-k8s-exporter
            --repo https://port-labs.github.io/helm-charts
            --namespace port-k8s-exporter --create-namespace
            --set $"secret.secrets.portClientId=($port_client_id)"
            --set $"secret.secrets.portClientSecret=($port_client_secret)"
            --set stateKey="k8s-exporter"
            --set createDefaultResources=false
            --set "extraEnv[0].name"="dot"
            --set "extraEnv[0].value"=dot
            --wait
    )

}

# Guides cleanup of Port.io resources
def "main delete port" [] {

    print $"
Delete all items from the (ansi yellow_bold)Catalog(ansi reset), (ansi yellow_bold)Self-service(ansi reset), and (ansi yellow_bold)Builder > Data model(ansi reset) pages in Port's Web UI.
Press any key to continue.
"
    input

}