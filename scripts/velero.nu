#!/usr/bin/env nu

# Installs Velero backup and restore solution for Kubernetes with provider-specific configuration
def apply_velero [provider: string, storage_name: string] {

    if $provider == "aws" {

        (
            velero install --provider aws
                --plugins velero/velero-plugin-for-aws:v1.10.0
                --bucket $storage_name
                --backup-location-config region=us-east-1
                --snapshot-location-config region=us-east-1
                --secret-file ./aws-creds.conf --output yaml
        )

    } else if $provider == "google" {

        (
            velero install --provider gcp
                --plugins velero/velero-plugin-for-gcp:v1.11.0
                --bucket $storage_name
                --secret-file ./google-creds.json --output yaml
        )

    } else if $provider == "azure" {

        (
            velero install --provider azure
                --plugins velero/velero-plugin-for-microsoft-azure:v1.11.0
                --bucket $storage_name
                --service-account-name velero
                --pod-labels azure.workload.identity/use=true
                --secret-file azure-creds.env
                --backup-location-config $"useAAD='true',resourceGroup=($env.RESOURCE_GROUP),storageAccount=($env.AZURE_SA_ID)"
        )

    } else {

        print $"(ansi red_bold)($provider)(ansi reset) is not a supported."
        exit 1

    }

}
