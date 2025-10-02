#!/usr/bin/env nu

def --env "main apply aso" [
    --namespace = "default"
    --apply_creds = true
    --sync_period = "1h"
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

        mut azure_tenant = ""
        if AZURE_TENANT not-in $env {
            $azure_tenant = input $"(ansi yellow_bold)Enter Azure Tenant: (ansi reset)"
        } else {
            $azure_tenant = $env.AZURE_TENANT
        }
        $"export AZURE_TENANT=($azure_tenant)\n" | save --append .env

        az login --tenant $azure_tenant

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
