#!/usr/bin/env nu

# Prompts user to select a cloud provider from available options
#
# Returns:
# The selected provider name and saves it to .env file
def "main get provider" [
    --providers = [aws azure google kind upcloud]  # List of cloud providers to choose from
] {

    let message = $"
Right now, only providers listed below are supported in this demo.
Please send an email to (ansi yellow_bold)viktor@farcic.com(ansi reset) if you'd like to add additional providers.

(ansi yellow_bold)Select a provider(ansi green_bold)"

    let provider = $providers | input list $message
    print $"(ansi reset)"

    $"export PROVIDER=($provider)\n" | save --append .env

    $provider
}

# Prints a reminder to source the environment variables
def "main print source" [] {

    print $"
Execute `(ansi yellow_bold)source .env(ansi reset)` to load the environment variables.
"

}

# Removes temporary files created during script execution
def "main delete temp_files" [] {

    rm --force .env

    rm --force kubeconfig*.yaml

}

# Retrieves and configures credentials for the specified cloud provider
#
# Examples:
# > main get creds aws
# > main get creds azure
def --env "main get creds" [
    provider: string,  # The cloud provider to configure credentials for (aws, azure, google)
    --aws-access-key-id: string,      # AWS Access Key ID (optional, falls back to AWS_ACCESS_KEY_ID env var)
    --aws-secret-access-key: string,  # AWS Secret Access Key (optional, falls back to AWS_SECRET_ACCESS_KEY env var)
    --aws-account-id: string,         # AWS Account ID (optional, falls back to AWS_ACCOUNT_ID env var)
    --azure-tenant: string            # Azure Tenant ID (optional, falls back to AZURE_TENANT env var)
] {

    mut creds = {provider: $provider}

    if $provider == "google" {

        gcloud auth login


    } else if $provider == "aws" {

        mut access_key = $aws_access_key_id
        if ($access_key | is-empty) and (AWS_ACCESS_KEY_ID in $env) {
            $access_key = $env.AWS_ACCESS_KEY_ID
        } else if ($access_key | is-empty) {
            error make { msg: "AWS Access Key ID required via --aws-access-key-id parameter or AWS_ACCESS_KEY_ID environment variable" }
        }
        $"export AWS_ACCESS_KEY_ID=($access_key)\n"
            | save --append .env
        $creds = ( $creds | upsert aws_access_key_id $access_key )

        mut secret_key = $aws_secret_access_key
        if ($secret_key | is-empty) and (AWS_SECRET_ACCESS_KEY in $env) {
            $secret_key = $env.AWS_SECRET_ACCESS_KEY
        } else if ($secret_key | is-empty) {
            error make { msg: "AWS Secret Access Key required via --aws-secret-access-key parameter or AWS_SECRET_ACCESS_KEY environment variable" }
        }
        $"export AWS_SECRET_ACCESS_KEY=($secret_key)\n"
            | save --append .env
        $creds = ( $creds | upsert aws_secret_access_key $secret_key )

        mut account_id = $aws_account_id
        if ($account_id | is-empty) and (AWS_ACCOUNT_ID in $env) {
            $account_id = $env.AWS_ACCOUNT_ID
        } else if ($account_id | is-empty) {
            error make { msg: "AWS Account ID required via --aws-account-id parameter or AWS_ACCOUNT_ID environment variable" }
        }
        $"export AWS_ACCOUNT_ID=($account_id)\n"
            | save --append .env
        $creds = ( $creds | upsert aws_account_id $account_id )

    } else if $provider == "azure" {

        mut tenant = $azure_tenant
        if ($tenant | is-empty) and (AZURE_TENANT in $env) {
            $tenant = $env.AZURE_TENANT
        } else if ($tenant | is-empty) {
            error make { msg: "Azure Tenant ID required via --azure-tenant parameter or AZURE_TENANT environment variable" }
        }
        $creds = ( $creds | upsert tenant_id $tenant )

        az login --tenant $tenant
    
    } else {

        print $"(ansi red_bold)($provider)(ansi reset) is not a supported."
        exit 1

    }

    $creds

}
