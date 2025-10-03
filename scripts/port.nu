#!/usr/bin/env nu

# Installs Port.io for software catalog management
#
# Examples:
# > main apply port myuser my-repo
def "main apply port" [
    github_user: string
    github_repo: string
    --port-client-id: string,      # Port Client ID (optional, falls back to PORT_CLIENT_ID env var)
    --port-client-secret: string   # Port Client Secret (optional, falls back to PORT_CLIENT_SECRET env var)
] {

    start "https://getport.io"

    print $"
(ansi yellow_bold)Sign Up(ansi reset) \(if not already registered\) and (ansi yellow_bold)Log In(ansi reset) to Port.
Press any key to continue.
"
    input

    mut client_id = $port_client_id
    if ($client_id | is-empty) and ("PORT_CLIENT_ID" in $env) {
        $client_id = $env.PORT_CLIENT_ID
    } else if ($client_id | is-empty) {
        error make { msg: "Port Client ID required via --port-client-id parameter or PORT_CLIENT_ID environment variable" }
    }
    $"export PORT_CLIENT_ID=($client_id)\n"
        | save --append .env

    mut client_secret = $port_client_secret
    if ($client_secret | is-empty) and ("PORT_CLIENT_SECRET" in $env) {
        $client_secret = $env.PORT_CLIENT_SECRET
    } else if ($client_secret | is-empty) {
        error make { msg: "Port Client Secret required via --port-client-secret parameter or PORT_CLIENT_SECRET environment variable" }
    }
    $"export PORT_CLIENT_SECRET=($client_secret)\n"
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
            --set $"secret.secrets.portClientId=($client_id)"
            --set $"secret.secrets.portClientSecret=($client_secret)"
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