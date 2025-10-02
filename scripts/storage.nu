#!/usr/bin/env nu

# Creates cloud storage resources based on the specified provider
#
# Returns:
# A record with the storage bucket name
def create_storage [provider: string, auth = true] {

    let bucket = $"dot-(date now | format date "%Y%m%d%H%M%S")"
    $"export STORAGE_NAME=($bucket)\n" | save --append .env

    if $provider == "aws" {

        (
            aws s3api create-bucket --bucket $bucket
                --region us-east-1
        )
        
        aws iam create-user --user-name velero
        
        (
            aws iam put-user-policy --user-name velero
                --policy-name velero
                --policy-document file://aws-storage-policy.json
        )
        
        let access_key_id = (
            aws iam create-access-key --user-name velero
                | from json
                | get AccessKey.AccessKeyId
        )
        $"export STORAGE_ACCESS_KEY_ID=($access_key_id)\n"
            | save --append .env

    } else if $provider == "google" {

        if $auth {
            gcloud auth login
        }

        (
            gcloud storage buckets create $"gs://($bucket)"
                --project $env.PROJECT_ID --location us-east1
        )

        (
            gcloud iam service-accounts create velero
                --project $env.PROJECT_ID --display-name "Velero"
        )

        let sa_email = $"velero@($env.PROJECT_ID).iam.gserviceaccount.com"

        (
            gcloud iam roles create velero.server
                --project $env.PROJECT_ID
                --file google-permissions.yaml
        )

        (
            gcloud projects add-iam-policy-binding $env.PROJECT_ID
                --member $"serviceAccount:($sa_email)"
                --role $"projects/($env.PROJECT_ID)/roles/velero.server"
        )

        (
            gsutil iam ch
                $"serviceAccount:($sa_email):objectAdmin"
                $"gs://($bucket)"
        )

        (
            gcloud iam service-accounts keys create
                google-creds.json --iam-account $sa_email
        )

    } else if $provider == "azure" {

        let sa_id = $"velero(uuidgen | cut -d '-' -f5 | tr '[A-Z]' '[a-z]')"
        $"export AZURE_SA_ID=($sa_id)\n" | save --append .env

        (
            az storage account create
                --name $sa_id
                --resource-group $env.RESOURCE_GROUP
                --sku Standard_GRS --encryption-services blob
                --https-only true --min-tls-version TLS1_2
                --kind BlobStorage --access-tier Hot
        )

        (
            az storage container create --name velero
                --public-access off --account-name $sa_id
                --resource-group $env.RESOURCE_GROUP
        )

        let subscription_id = (az account list 
            --query '[?isDefault].id' --output tsv)

        open azure-permissions.json
            | upsert AssignableScopes.0 $"/subscriptions/($subscription_id)"
            | save azure-permissions.json --force

        (
            az role definition create
                --role-definition azure-permissions.json
                --resource-group $env.RESOURCE_GROUP
        )

        let tenant_id = (az account list
            --query '[?isDefault].tenantId' --output tsv)
        
        let client_secret = (az ad sp create-for-rbac
            --name velero --role Velero --query 'password'
            --output tsv
            --scopes  $"/subscriptions/($subscription_id)"
            --resource-group $env.RESOURCE_GROUP
        )

        let client_id = (az ad sp list --display-name "velero"
            --query '[0].appId' --output tsv)
        $"export AZURE_CLIENT_ID=($client_id)\n"
            | save --append .env

        $"AZURE_SUBSCRIPTION_ID=($subscription_id)
AZURE_TENANT_ID=($tenant_id)
AZURE_CLIENT_ID=($client_id)
AZURE_CLIENT_SECRET=($client_secret)
AZURE_RESOURCE_GROUP=($env.RESOURCE_GROUP)
AZURE_CLOUD_NAME=AzurePublicCloud" | save azure-creds.env --force

    } else {

        print $"(ansi red_bold)($provider)(ansi reset) is not a supported."
        exit 1

    }

    {name: $bucket}

}

# Destroys cloud storage resources created for the specified provider
def destroy_storage [provider: string, storage_name: string, delete_project = true] {

    if $provider == "aws" {

        do --ignore-errors {
            
            (
                aws iam delete-access-key --user-name velero
                    --access-key-id $env.STORAGE_ACCESS_KEY_ID
                    --region us-east-1
            )

            (
                aws iam delete-user-policy --user-name velero
                    --policy-name velero
                    --region us-east-1
            )

            aws iam delete-user --user-name velero

        }

        (        
            aws s3 rm $"s3://($storage_name)" --recursive
                --include "*"
        )

        (
            aws s3api delete-bucket --bucket $storage_name
                --region us-east-1
        )
    
    } else if $provider == "google" {

        (
            gcloud storage rm $"gs://($storage_name)" --recursive
                --project $env.PROJECT_ID
        )

        if $delete_project {
            gcloud projects delete $env.PROJECT_ID --quiet
        }

    } else if $provider == "azure" {

        (
            az storage container delete --name velero
                --account-name $env.AZURE_SA_ID
        )

        (
            az storage account delete
                --name $env.AZURE_SA_ID
                --resource-group $env.RESOURCE_GROUP --yes
        )

        az ad sp delete --id $env.AZURE_CLIENT_ID
        
        az role definition delete --name Velero

    } else {

        print $"(ansi red_bold)($provider)(ansi reset) is not a supported."
        exit 1

    }

}
