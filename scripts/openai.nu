#!/usr/bin/env nu

# Retrieves OpenAI token
#
# Returns:
# A record with token, and saves values to .env file
def --env "main get openai" [] {

    mut openai_api_key = ""
    if "OPENAI_API_KEY" in $env {
        $openai_api_key = $env.OPENAI_API_KEY
    } else {
        let value = input $"(ansi green_bold)Enter OpenAI token:(ansi reset) "
        $openai_api_key = $value
    }
    $"export OPENAI_API_KEY=($openai_api_key)\n" | save --append .env

    {token: $openai_api_key}

}
