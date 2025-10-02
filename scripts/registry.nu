#!/usr/bin/env nu

# Returns registry information.
#
# Example: `{server: "my-server", user: "my-user", email: "my-email", password: "my-password"}`
def --env "main get registry" []: [
    string -> record 
] {

    mut server = ""
    if "REGISTRY_SERVER" not-in $env {
        $server = input $"(ansi green_bold)Enter container image registry \(e.g., ghcr.io\):(ansi reset) "
    } else {
        $server = $env.REGISTRY_SERVER
    }
    $"export REGISTRY_SERVER=($server)\n" | save --append .env

    mut user = ""
    if "REGISTRY_USER" not-in $env {
        $user = input $"(ansi green_bold)Enter container image registry user \(e.g., vfarcic\):(ansi reset) "
    } else {
        $user = $env.REGISTRY_USER
    }
    $"export REGISTRY_USER=($user)\n" | save --append .env

    mut email = ""
    if "REGISTRY_EMAIL" not-in $env {
        $email = input $"(ansi green_bold)Enter container image registry email \(e.g., viktor@farcic.com\):(ansi reset) "
    } else {
        $email = $env.REGISTRY_EMAIL
    }
    $"export REGISTRY_EMAIL=($email)\n" | save --append .env

    mut password = ""
    if "REGISTRY_PASSWORD" not-in $env {
        $password = input $"(ansi green_bold)Enter container image registry token:(ansi reset) "
    } else {
        $password = $env.REGISTRY_PASSWORD
    }
    $"export REGISTRY_PASSWORD=($password)\n" | save --append .env

    {server: $server, user: $user, email: $email, password: $password}

}
