#!/usr/bin/env nu

# Retrieves Anthropic token
#
# Parameters:
# --anthropic-api-key: Anthropic API key (optional, falls back to ANTHROPIC_API_KEY env var)
#
# Returns:
# A record with token, and saves values to .env file
def --env "main get anthropic" [
    --anthropic-api-key: string
] {

    mut key = $anthropic_api_key
    if ($key | is-empty) and ("ANTHROPIC_API_KEY" in $env) {
        $key = $env.ANTHROPIC_API_KEY
    } else if ($key | is-empty) {
        error make { msg: "Anthropic API key required via --anthropic-api-key parameter or ANTHROPIC_API_KEY environment variable" }
    }
    $"export ANTHROPIC_API_KEY=($key)\n" | save --append .env

    {token: $key}

}
