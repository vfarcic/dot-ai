#!/usr/bin/env nu

# Retrieves GitHub credentials (token and organization/username)
#
# Parameters:
# --enable-org: Whether to retrieve GitHub organization/user (default: true)
# --github-token: GitHub token (optional, falls back to GITHUB_TOKEN or REGISTRY_PASSWORD env var)
# --github-org: GitHub organization/username (optional, falls back to GITHUB_ORG or REGISTRY_USER env var)
#
# Returns:
# A record with org and token fields, and saves values to .env file
def --env "main get github" [
    --enable-org = true,
    --github-token: string,
    --github-org: string
] {

    mut token = $github_token
    if ($token | is-empty) and ("GITHUB_TOKEN" in $env) {
        $token = $env.GITHUB_TOKEN
    } else if ($token | is-empty) and ("REGISTRY_PASSWORD" in $env) {
        $token = $env.REGISTRY_PASSWORD
    } else if ($token | is-empty) {
        error make { msg: "GitHub token required via --github-token parameter or GITHUB_TOKEN/REGISTRY_PASSWORD environment variable" }
    }
    $"export GITHUB_TOKEN=($token)\n" | save --append .env

    mut org = $github_org
    if $enable_org {
        if ($org | is-empty) and ("GITHUB_ORG" in $env) {
            $org = $env.GITHUB_ORG
        } else if ($org | is-empty) and ("REGISTRY_USER" in $env) {
            $org = $env.REGISTRY_USER
        } else if ($org | is-empty) {
            error make { msg: "GitHub organization/username required via --github-org parameter or GITHUB_ORG/REGISTRY_USER environment variable" }
        }
        $"export GITHUB_ORG=($org)\n" | save --append .env
    }

    {org: $org, token: $token}

}
