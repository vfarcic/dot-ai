#!/usr/bin/env nu

# Installs External Secrets Operator (ESO) with optional cloud provider configuration
#
# Examples:
# > main apply external_secrets --provider google --google_project_id my-project
# > main apply external_secrets --provider azure --azure_key_vault_name my-vault
def "main apply external_secrets" [
    --provider: string               # Supported values: `google`, `azure`
    --google_project_id: string    # Used only if `provider` is `google`
    --azure_key_vault_name: string # Used only if `provider` is `azure`
] {

    print $"\nInstalling (ansi yellow_bold)External Secrets Operator \(ESO\)(ansi reset)...\n"

    (
        helm repo add external-secrets
            https://charts.external-secrets.io
    )

    helm repo update

    (
        helm upgrade --install
            external-secrets external-secrets/external-secrets
            --namespace external-secrets --create-namespace
            --wait
    )

    if $provider == "google" {

        {
            apiVersion: "external-secrets.io/v1beta1"
            kind: "ClusterSecretStore"
            metadata: { name: "google" }
            spec: { provider: { gcpsm: {
                auth: { secretRef: { secretAccessKeySecretRef: {
                    name: "gcp-creds"
                    key: "creds"
                    namespace: "crossplane-system"
                } } }
                projectID: $google_project_id
            } } }
        } | to yaml | kubectl apply --filename -

        start $"https://console.developers.google.com/apis/api/secretmanager.googleapis.com/overview?project=($google_project_id)"
            
        print $"
(ansi yellow_bold)ENABLE(ansi reset) the API.
Press the (ansi yellow_bold)enter key(ansi reset) to continue.
"
        input

    } else if $provider == "azure" {

        # FIXME: Uncomment and rewrite
        
        # az keyvault create --name $RESOURCE_GROUP \
        #     --resource-group $RESOURCE_GROUP

        # az keyvault key create --vault-name $RESOURCE_GROUP --name "ContosoFirstKey" --protection software

        # export AZURE_UPN=$(az ad user list | jq ".[0].userPrincipalName" -r)

        # export AZURE_SUBSCRIPTION_ID=$(az account show --query id -o tsv)

        # az role assignment create \
        #     --role "Key Vault Secrets Officer" \
        #     --assignee $AZURE_UPN \
        #     --scope "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.KeyVault/vaults/$RESOURCE_GROUP"

        {
            apiVersion: "external-secrets.io/v1beta1"
            kind: "ClusterSecretStore"
            metadata: { name: "azure" }
            spec: { provider: { azurekv: {
                authType: "ManagedIdentity"
                vaultUrl: $"https://($azure_key_vault_name).vault.azure.net"
            } } }
        } | to yaml | kubectl apply --filename -

    } else if $provider == "aws" {

        {
            apiVersion: "external-secrets.io/v1beta1"
            kind: "ClusterSecretStore"
            metadata: { name: "aws" }
            spec: {
                provider: { aws: {
                    service: "SecretsManager"
                    region: "us-east-1"
                    auth: { secretRef: {
                        accessKeyIDSecretRef: {
                            name: "aws-creds"
                            key: "accessKeyID"
                            namespace: "crossplane-system"
                        }
                        secretAccessKeySecretRef: {
                            name: "aws-creds"
                            key: "secretAccessKey"
                            namespace: "crossplane-system"
                        }
                    } }
                } }
            }
        } | to yaml | kubectl apply --filename -

    }

}
