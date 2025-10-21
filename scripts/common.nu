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
] {

    mut creds = {provider: $provider}

    if $provider == "google" {

        gcloud auth login


    } else if $provider == "aws" {

        mut aws_access_key_id = ""
        if AWS_ACCESS_KEY_ID in $env {
            $aws_access_key_id = $env.AWS_ACCESS_KEY_ID
        } else {
            $aws_access_key_id = input $"(ansi green_bold)Enter AWS Access Key ID: (ansi reset)"
        }
        $"export AWS_ACCESS_KEY_ID=($aws_access_key_id)\n"
            | save --append .env
        $creds = ( $creds | upsert aws_access_key_id $aws_access_key_id )

        mut aws_secret_access_key = ""
        if AWS_SECRET_ACCESS_KEY in $env {
            $aws_secret_access_key = $env.AWS_SECRET_ACCESS_KEY
        } else {
            $aws_secret_access_key = input $"(ansi green_bold)Enter AWS Secret Access Key: (ansi reset)" --suppress-output
            print ""
        }
        $"export AWS_SECRET_ACCESS_KEY=($aws_secret_access_key)\n"
            | save --append .env
        $creds = ( $creds | upsert aws_secret_access_key $aws_secret_access_key )

        mut aws_account_id = ""
        if AWS_ACCOUNT_ID in $env {
            $aws_account_id = $env.AWS_ACCOUNT_ID
        } else {
            $aws_account_id = input $"(ansi green_bold)Enter AWS Account ID: (ansi reset)"
        }
        $"export AWS_ACCOUNT_ID=($aws_account_id)\n"
            | save --append .env
        $creds = ( $creds | upsert aws_account_id $aws_account_id )

    } else if $provider == "azure" {

        mut tenant_id = ""

        if AZURE_TENANT in $env {
            $tenant_id = $env.AZURE_TENANT
        } else {
            $tenant_id = input $"(ansi green_bold)Enter Azure Tenant ID: (ansi reset)"
        }
        $creds = ( $creds | upsert tenant_id $tenant_id )

        az login --tenant $tenant_id
    
    } else {

        print $"(ansi red_bold)($provider)(ansi reset) is not a supported."
        exit 1

    }

    $creds

}
