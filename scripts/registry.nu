#!/usr/bin/env nu

# Returns registry information.
#
# Parameters:
# --registry-server: Container registry server (optional, falls back to REGISTRY_SERVER env var)
# --registry-user: Container registry user (optional, falls back to REGISTRY_USER env var)
# --registry-email: Container registry email (optional, falls back to REGISTRY_EMAIL env var)
# --registry-password: Container registry password/token (optional, falls back to REGISTRY_PASSWORD env var)
#
# Example: `{server: "my-server", user: "my-user", email: "my-email", password: "my-password"}`
def --env "main get registry" [
    --registry-server: string,
    --registry-user: string,
    --registry-email: string,
    --registry-password: string
]: [
    string -> record
] {

    mut server = $registry_server
    if ($server | is-empty) and ("REGISTRY_SERVER" in $env) {
        $server = $env.REGISTRY_SERVER
    } else if ($server | is-empty) {
        error make { msg: "Registry server required via --registry-server parameter or REGISTRY_SERVER environment variable" }
    }
    $"export REGISTRY_SERVER=($server)\n" | save --append .env

    mut user = $registry_user
    if ($user | is-empty) and ("REGISTRY_USER" in $env) {
        $user = $env.REGISTRY_USER
    } else if ($user | is-empty) {
        error make { msg: "Registry user required via --registry-user parameter or REGISTRY_USER environment variable" }
    }
    $"export REGISTRY_USER=($user)\n" | save --append .env

    mut email = $registry_email
    if ($email | is-empty) and ("REGISTRY_EMAIL" in $env) {
        $email = $env.REGISTRY_EMAIL
    } else if ($email | is-empty) {
        error make { msg: "Registry email required via --registry-email parameter or REGISTRY_EMAIL environment variable" }
    }
    $"export REGISTRY_EMAIL=($email)\n" | save --append .env

    mut password = $registry_password
    if ($password | is-empty) and ("REGISTRY_PASSWORD" in $env) {
        $password = $env.REGISTRY_PASSWORD
    } else if ($password | is-empty) {
        error make { msg: "Registry password required via --registry-password parameter or REGISTRY_PASSWORD environment variable" }
    }
    $"export REGISTRY_PASSWORD=($password)\n" | save --append .env

    {server: $server, user: $user, email: $email, password: $password}

}
