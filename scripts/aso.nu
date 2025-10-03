#!/usr/bin/env nu

def --env "main apply aso" [
    --namespace = "default"
    --apply_creds = true
    --sync_period = "1h"
    --azure-tenant: string  # Azure Tenant ID (optional, falls back to AZURE_TENANT env var)
] {

    (
        helm upgrade --install aso2 azure-service-operator
            --repo https://raw.githubusercontent.com/Azure/azure-service-operator/main/v2/charts
            --namespace=azureserviceoperator-system
            --create-namespace
            --set crdPattern='resources.azure.com/*;dbforpostgresql.azure.com/*'
            --wait
    )

    if $apply_creds {

        mut tenant = $azure_tenant
        if ($tenant | is-empty) and ("AZURE_TENANT" in $env) {
            $tenant = $env.AZURE_TENANT
        } else if ($tenant | is-empty) {
            error make { msg: "Azure Tenant ID required via --azure-tenant parameter or AZURE_TENANT environment variable" }
        }
        $"export AZURE_TENANT=($tenant)\n" | save --append .env

        az login --tenant $tenant

        let subscription_id = (az account show --query id -o tsv)

        let azure_data = (
            az ad sp create-for-rbac --sdk-auth --role Owner
                --scopes $"/subscriptions/($subscription_id)" | from json
        )

        {
            apiVersion: "v1"
            kind: "Secret"
            metadata: {
                name: "aso-credential"
                namespace: $namespace
            }
            stringData: {
                AZURE_SUBSCRIPTION_ID: $azure_data.subscriptionId
                AZURE_TENANT_ID: $azure_data.tenantId
                AZURE_CLIENT_ID: $azure_data.clientId
                AZURE_CLIENT_SECRET: $azure_data.clientSecret
            }
        } | to yaml | kubectl apply --filename -

        {
            apiVersion: "v1"
            kind: "Secret"
            metadata: {
                name: "aso-controller-settings"
                namespace: "azureserviceoperator-system"
            }
            stringData: {
                MAX_CONCURRENT_RECONCILES: "1"
                AZURE_SYNC_PERIOD: $sync_period
            }
        } | to yaml | kubectl apply --filename -

        (
            kubectl --namespace azureserviceoperator-system
                rollout restart deployment
                azureserviceoperator-controller-manager
        )

    }

}
