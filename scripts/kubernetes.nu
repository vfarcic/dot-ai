#!/usr/bin/env nu

# Creates a Kubernetes cluster with the specified provider
#
# Examples:
# > main create kubernetes aws --name my-cluster --min_nodes 3 --max_nodes 5
# > main create kubernetes kind --name test-cluster
def --env "main create kubernetes" [
    provider: string  # The Kubernetes provider to use (aws, azure, google, upcloud, kind)
    --name = "dot"  # Name of the Kubernetes cluster
    --min-nodes = 2  # Minimum number of nodes in the cluster
    --max-nodes = 4  # Maximum number of nodes in the cluster
    --node-size = "small" # Supported values: small, medium, large
    --auth = true  # Whether to perform authentication with the cloud provider
    --enable-ingress = true  # Whether to enable ingress for the kind provider
] {

    $env.KUBECONFIG = $"($env.PWD)/kubeconfig-($name).yaml"
    $"export KUBECONFIG=($env.KUBECONFIG)\n" | save --append .env
    $"export KUBECONFIG_($name | str upcase)=($env.KUBECONFIG)\n" | save --append .env

    if $provider == "google" {

        (
            create gke --name $name --node_size $node_size
                --min_nodes $min_nodes --max_nodes $max_nodes
                --auth $auth
        )

    } else if $provider == "aws" {

        (
            create eks  --name $name --node_size $node_size
                --min_nodes $min_nodes --max_nodes $max_nodes
        )

    } else if $provider == "azure" {

        (
            create aks --name $name --node_size $node_size
                --min_nodes $min_nodes --max_nodes $max_nodes
        )

    } else if $provider == "upcloud" {

        (
            create upcloud --name $name --node_size $node_size
                --min_nodes $min_nodes --max_nodes $max_nodes
        )

    } else if $provider == "kind" {

        mut config = {
            kind: "Cluster"
            apiVersion: "kind.x-k8s.io/v1alpha4"
            name: $name
            nodes: [{
                role: "control-plane"
            }]
        }

        if $enable_ingress {
            $config = $config | merge {
                nodes: [{
                    role: "control-plane"
                    kubeadmConfigPatches: ['kind: InitConfiguration
nodeRegistration:
  kubeletExtraArgs:
    node-labels: "ingress-ready=true"'
                    ]
                    extraPortMappings: [{
                        containerPort: 80
                        hostPort: 80
                        protocol: "TCP"
                    }, {
                        containerPort: 443
                        hostPort: 443
                        protocol: "TCP"
                    }]
                }]
            }
        }
        
        $config | to yaml | save $"kind.yaml" --force

        kind create cluster --config kind.yaml
    
    } else {

        print $"(ansi red_bold)($provider)(ansi reset) is not a supported."
        exit 1

    }

    $env.KUBECONFIG

}

# Lists the required packages for Kubernetes functionality
#
# Examples:
# > main packages kubernetes
def "main packages kubernetes" [] {

    print $"(ansi yellow_bold)Following Nix packages are required(ansi reset):
* kind
* kubectl
* awscli2
* eksctl
* google-cloud-sdk
* azure-cli
"

print $"(ansi yellow_bold)Following tools not available as Nix packages are required(ansi reset):
* upctl
"

}

# Destroys a Kubernetes cluster created with the specified provider
#
# Examples:
# > main destroy kubernetes aws --name my-cluster
# > main destroy kubernetes google --name test-cluster --delete_project false
def "main destroy kubernetes" [
    provider: string  # The Kubernetes provider to delete (aws, azure, google, upcloud, kind)
    --name = "dot"  # Name of the Kubernetes cluster to destroy
    --delete_project = true  # Whether to delete the associated cloud project
] {

    if $provider == "google" {

        rm --force $env.KUBECONFIG

        (
            gcloud container clusters delete $name
                --project $env.PROJECT_ID --zone us-east1-b --quiet
        )

        if $delete_project {
            gcloud projects delete $env.PROJECT_ID --quiet
        }
    
    } else if $provider == "aws" {

        let region = "us-east-1"

        (
            eksctl delete addon --name aws-ebs-csi-driver
                --cluster $name --region $region
        )

        (
            eksctl delete nodegroup --name primary
                --cluster $name --drain=false
                --region $region --parallel 10 --wait
        )

        (
            eksctl delete cluster
                --config-file $"eksctl-config-($name).yaml"
                --wait
        )

    } else if $provider == "azure" {

        (
            az aks delete --resource-group $env.RESOURCE_GROUP
                --name $name --yes
        )

        if $delete_project {

            az group delete --name $env.RESOURCE_GROUP --yes

        }

    } else if $provider == "upcloud" {

        print $"Deleting (ansi yellow_bold)Kubernetes(ansi reset)..."

        upctl kubernetes delete $name

        print $"Waiting for (ansi yellow_bold)10 minutes(ansi reset) to fully clean up the cluster..."

        sleep 600sec

        print $"Deleting (ansi yellow_bold)network(ansi reset)..."

        upctl network delete $name

    } else if $provider == "kind" {

        kind delete cluster --name $name

    }

    if "KUBECONFIG" in $env {
        rm --force $env.KUBECONFIG
    }

}

# Creates Kubernetes credentials in a kubeconfig file
#
# Examples:
# > main create kubernetes_creds --source_kuberconfig kubeconfig.yaml --destination_kuberconfig new-kubeconfig.yaml
def "main create kubernetes_creds" [
    --source_kuberconfig = "kubeconfig.yaml"  # Path to the source kubeconfig file
    --destination_kuberconfig = "kubeconfig_new.yaml"  # Path to the destination kubeconfig file
] {

    {
        apiVersion: "v1"
        kind: "ServiceAccount"
        metadata: {
            name: "creds"
            namespace: "kube-system"
        }
    } | to yaml | kubectl --kubeconfig $source_kuberconfig apply --filename -

    {
        apiVersion: "v1"
        kind: "Secret"
        metadata: {
            name: "creds"
            namespace: "kube-system"
            annotations: {
                "kubernetes.io/service-account.name": "creds"
            }
        }
        type: "kubernetes.io/service-account-token"
    } | to yaml | kubectl --kubeconfig $source_kuberconfig apply --filename -

    {
        apiVersion: "rbac.authorization.k8s.io/v1"
        kind: "ClusterRoleBinding"
        metadata: {
            name: "creds"
        }
        subjects: [{
            kind: "ServiceAccount"
            name: "creds"
            namespace: "kube-system"
        }]
        roleRef: {
            kind: "ClusterRole"
            name: "cluster-admin"
            apiGroup: "rbac.authorization.k8s.io"
        }
    }
        | to yaml
        | kubectl --kubeconfig $source_kuberconfig apply --filename -

    let kube_ca_data = open $source_kuberconfig
        | get clusters.0.cluster.certificate-authority-data

    let kube_url = open $source_kuberconfig
        | get clusters.0.cluster.server

    let token_encoded = (
        kubectl
            --kubeconfig $source_kuberconfig
            --namespace kube-system
            get secret creds --output yaml
    )
        | from yaml
        | get data.token

    let token = ($token_encoded | decode base64 | decode)

    {
        apiVersion: "v1"
        kind: "Config"
        clusters: [{
            name: "default-cluster"
            cluster: {
                certificate-authority-data: $kube_ca_data
                server: $"($kube_url):443"
            }
        }]
        contexts: [{
            name: "default-context"
            context: {
                cluster: "default-cluster"
                namespace: "default"
                user: "default-user"
            }
        }]
        current-context: "default-context"
        users: [{
            name: "default-user"
            user: {
                token: $token
            }
        }]
    } | to yaml | save $source_kuberconfig --force

}

# Creates a UpCloud Kubernetes cluster
#
# Examples:
# > create upcloud --name my-cluster --node_size medium --min_nodes 3 --max_nodes 5
def --env "create upcloud" [
    --name = "dot"  # Name of the Kubernetes cluster
    --node_size = "small" # Supported values: small, medium, large
    --min_nodes = 2  # Minimum number of nodes in the cluster
    --max_nodes = 4  # Maximum number of nodes in the cluster
] {

print $"
Visit https://signup.upcloud.com/?promo=devops50 to (ansi yellow_bold)sign up(ansi reset) and get $50+ credits.
Make sure that (ansi yellow_bold)Allow API connections from all networks(ansi reset) is checked inside the https://hub.upcloud.com/account/overview page.
Install `(ansi yellow_bold)upctl(ansi reset)` from https://upcloudltd.github.io/upcloud-cli if you do not have it already.
Press the (ansi yellow_bold)enter key(ansi reset) to continue.
"
        input

        mut upcloud_username = ""
        if UPCLOUD_USERNAME in $env {
            $upcloud_username = $env.UPCLOUD_USERNAME
        } else {
            $upcloud_username = input $"(ansi green_bold)Enter UpCloud username: (ansi reset)"
            $env.UPCLOUD_USERNAME = $upcloud_username
        }
        $"export UPCLOUD_USERNAME=($upcloud_username)\n"
            | save --append .env
    
        mut upcloud_password = ""
        if UPCLOUD_PASSWORD in $env {
            $upcloud_password = $env.UPCLOUD_PASSWORD
        } else {
            $upcloud_password = input $"(ansi green_bold)Enter UpCloud password: (ansi reset)" --suppress-output
            $env.UPCLOUD_PASSWORD = $upcloud_password
        }
        $"export UPCLOUD_PASSWORD=($upcloud_password)\n"
            | save --append .env
        print ""

        mut vm_size = "2xCPU-4GB"
        if $node_size == "medium" {
            $vm_size = "4xCPU-8GB"
        } else if $node_size == "large" {
            $vm_size = "8xCPU-32GB"
        }

        print $"Creating (ansi yellow_bold)network(ansi reset)..."

        do --ignore-errors {(
            upctl network create --name $name --zone us-nyc1
                --ip-network address="10.0.1.0/24,dhcp=true"
        )}

        print $"Creating (ansi yellow_bold)Kubernetes(ansi reset) cluster..."

        (
            upctl kubernetes create --name $name --zone us-nyc1
                --node-group $"count=($min_nodes),name=dot,plan=($vm_size)"
                --plan dev-md  --network $name --version "1.30"
                --kubernetes-api-allow-ip "0.0.0.0/0" --wait
        )

        print $"Getting (ansi yellow_bold)kubeconfig(ansi reset)..."

        (
            upctl kubernetes config $name --output yaml
                --write $env.KUBECONFIG
        )

        print $"Waiting for (ansi yellow_bold)5 minutes(ansi reset) to fully set up the cluster..."

        sleep 300sec

}

# Creates an Azure Kubernetes Service (AKS) cluster
#
# Examples:
# > create aks --name my-cluster --node_size medium --min_nodes 3 --max_nodes 5
def --env "create aks" [
    --name = "dot",  # Name of the Kubernetes cluster
    --min_nodes = 2,  # Minimum number of nodes in the cluster
    --max_nodes = 4,  # Maximum number of nodes in the cluster
    --node_size = "small" # Supported values: small, medium, large
    --auth = true  # Whether to perform authentication with Azure
] {

    mut tenant_id = ""
    let location = "eastus"

    if AZURE_TENANT in $env {
        $tenant_id = $env.AZURE_TENANT
    } else {
        $tenant_id = input $"(ansi green_bold)Enter Azure Tenant ID: (ansi reset)"
    }

    if $auth {
        az login --tenant $tenant_id
    }

    mut resource_group = ""
    if RESOURCE_GROUP in $env {
        $resource_group = $env.RESOURCE_GROUP
    } else {
        $resource_group = $"dot-(date now | format date "%Y%m%d%H%M%S")"
        $env.RESOURCE_GROUP = $resource_group
        $"export RESOURCE_GROUP=($resource_group)\n" | save --append .env
        az group create --name $resource_group --location $location
    }
    mut vm_size = "Standard_B2s"
    if $node_size == "medium" {
        $vm_size = "Standard_B4ms"
    } else if $node_size == "large" {
        $vm_size = "Standard_B8ms"
    }

    (
        az aks create --resource-group $resource_group --name $name
            --node-count $min_nodes --min-count $min_nodes
            --max-count $max_nodes
            --node-vm-size $vm_size
            --enable-managed-identity --generate-ssh-keys
            --enable-cluster-autoscaler --yes
    )

    (
        az aks get-credentials --resource-group $resource_group
            --name $name --file $env.KUBECONFIG
    )

}

# Creates a Google Kubernetes Engine (GKE) cluster
#
# Examples:
# > create gke --name my-cluster --node_size medium --min_nodes 3 --max_nodes 5 --auth true
def --env "create gke" [
    --name = "dot",  # Name of the Kubernetes cluster
    --min_nodes = 2,  # Minimum number of nodes in the cluster
    --max_nodes = 4,  # Maximum number of nodes in the cluster
    --node_size = "small" # Supported values: small, medium, large
    --auth = true  # Whether to perform authentication with Google Cloud
] {

    if $auth {
        gcloud auth login
    }

    mut project_id = ""
    if PROJECT_ID in $env and not $auth {
        $project_id = $env.PROJECT_ID
    } else {
        $project_id = $"dot-(date now | format date "%Y%m%d%H%M%S")"
        $env.PROJECT_ID = $project_id
        $"export PROJECT_ID=($project_id)\n" | save --append .env

        gcloud projects create $project_id

        start $"https://console.cloud.google.com/marketplace/product/google/container.googleapis.com?project=($project_id)"

        print $"
    (ansi yellow_bold)ENABLE(ansi reset) the API.
    Press the (ansi yellow_bold)enter key(ansi reset) to continue.
    "
        input
    }

    mut vm_size = "e2-standard-2"
    if $node_size == "medium" {
        $vm_size = "e2-standard-4"
    } else if $node_size == "large" {
        $vm_size = "e2-standard-8"
    }

    (
        gcloud container clusters create $name --project $project_id
            --zone us-east1-b --machine-type $vm_size
            --enable-autoscaling --num-nodes $min_nodes
            --min-nodes $min_nodes --max-nodes $max_nodes
            --enable-network-policy --no-enable-autoupgrade
    )

    (
        gcloud container clusters get-credentials $name
            --project $project_id --zone us-east1-b
    )

}

# Creates an Amazon Elastic Kubernetes Service (EKS) cluster
#
# Examples:
# > create eks --name my-cluster --node_size medium --min_nodes 3 --max_nodes 5
def --env "create eks" [
    --name = "dot",  # Name of the Kubernetes cluster
    --min_nodes = 2,  # Minimum number of nodes in the cluster
    --max_nodes = 4,  # Maximum number of nodes in the cluster
    --node_size = "small" # Supported values: small, medium, large
] {

    let region = "us-east-1"

    mut aws_access_key_id = ""
    if AWS_ACCESS_KEY_ID in $env {
        $aws_access_key_id = $env.AWS_ACCESS_KEY_ID
    } else {
        $aws_access_key_id = input $"(ansi green_bold)Enter AWS Access Key ID: (ansi reset)"
    }
    $"export AWS_ACCESS_KEY_ID=($aws_access_key_id)\n"
        | save --append .env

    mut aws_secret_access_key = ""
    if AWS_SECRET_ACCESS_KEY in $env {
        $aws_secret_access_key = $env.AWS_SECRET_ACCESS_KEY
    } else {
        $aws_secret_access_key = input $"(ansi green_bold)Enter AWS Secret Access Key: (ansi reset)" --suppress-output
    }
    $"export AWS_SECRET_ACCESS_KEY=($aws_secret_access_key)\n"
        | save --append .env

    let aws_account_id = (
        aws sts get-caller-identity --query "Account" 
            --output text
    )
    $"export AWS_ACCOUNT_ID=($aws_account_id)\n"
        | save --append .env

    $"[default]
aws_access_key_id = ($aws_access_key_id)
aws_secret_access_key = ($aws_secret_access_key)
" | save aws-creds.conf --force

    mut vm_size = "t3.medium"
    if $node_size == "medium" {
        $vm_size = "t3.xlarge"
    } else if $node_size == "large" {
        $vm_size = "t3.2xlarge"
    }

    {
        apiVersion: "eksctl.io/v1alpha5"
        kind: "ClusterConfig"
        metadata: {
            name: $name
            region: $region
            version: "1.31"
        }
        managedNodeGroups: [{
            name: "primary"
            instanceType: $vm_size
            minSize: $min_nodes
            maxSize: $max_nodes
            iam: {
                withAddonPolicies: {
                    autoScaler: true
                    ebs: true
                }
            }
        }]
    } | to yaml | save $"eksctl-config-($name).yaml" --force

    (
        eksctl create cluster
            --config-file $"eksctl-config-($name).yaml"
            --kubeconfig $env.KUBECONFIG
    )

    (
        eksctl create addon --name aws-ebs-csi-driver
            --cluster $name
            --service-account-role-arn $"arn:aws:iam::($aws_account_id):role/AmazonEKS_EBS_CSI_DriverRole"
            --region $region --force
    )

    (
        kubectl patch storageclass gp2
            --patch '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
    )

    (
        eksctl utils associate-iam-oidc-provider --cluster $name
            --region $region --approve
    )

    let oidc_provider = (
        aws eks describe-cluster --name $name --region $region
            --query "cluster.identity.oidc.issuer"
            --output text | str replace "https://" ""
    )
    $"export OIDC_PROVIDER=($oidc_provider)\n"
        | save --append .env

}