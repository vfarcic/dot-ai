#!/usr/bin/env nu

# Configures a Backstage instance with Crossplane integration
def --env "main configure backstage" [] {

    rm --force --recursive backstage
    
    print $"
When asked for a name for the Backstage app make sure to keep the default value (ansi yellow_bold)backstage(ansi reset)
Press the (ansi yellow_bold)enter key(ansi reset) to continue.
"
    input

    npx @backstage/create-app@latest

    cd backstage

    for package in [
        "@terasky/backstage-plugin-crossplane-common@1.1.0",
        "@terasky/backstage-plugin-crossplane-permissions-backend@1.1.1",
        "@terasky/backstage-plugin-kubernetes-ingestor@1.5.0",
        "@terasky/backstage-plugin-scaffolder-backend-module-terasky-utils@1.1.0"
    ] {
        yarn --cwd packages/backend add $package
    }

    for package in [
        "@terasky/backstage-plugin-crossplane-resources-frontend@1.4.0"
    ] {
        yarn --cwd packages/app add $package
    }

    open app-config.yaml
        | upsert backend.csp.upgrade-insecure-requests false
        | upsert crossplane.enablePermissions false
        | upsert kubernetesIngestor.components.enabled true
        | upsert kubernetesIngestor.components.taskRunner.frequency 10
        | upsert kubernetesIngestor.components.taskRunner.timeout 600
        | upsert kubernetesIngestor.components.excludedNamespaces []
        | upsert kubernetesIngestor.components.excludedNamespaces.0 "kube-public"
        | upsert kubernetesIngestor.components.excludedNamespaces.1 "kube-system"
        | upsert kubernetesIngestor.components.customWorkloadTypes []
        | upsert kubernetesIngestor.components.customWorkloadTypes.0 { group: "core.oam.dev", apiVersion: "v1beta1", plural: "applications" }
        | upsert kubernetesIngestor.components.disableDefaultWorkloadTypes "${DISABLE_DEFAULT_WORKLOAD_TYPES-false}"
        | upsert kubernetesIngestor.components.onlyIngestAnnotatedResources false
        | upsert kubernetesIngestor.crossplane.claims.ingestAllClaims true
        | upsert kubernetesIngestor.crossplane.xrds.publishPhase.allowedTargets ["github.com"]
        | upsert kubernetesIngestor.crossplane.xrds.publishPhase.target "github.com"
        | upsert kubernetesIngestor.crossplane.xrds.publishPhase.target "github.com"
        | upsert kubernetesIngestor.crossplane.xrds.publishPhase.allowRepoSelection true
        | upsert kubernetesIngestor.crossplane.xrds.enabled true
        | upsert kubernetesIngestor.crossplane.xrds.taskRunner.frequency 10
        | upsert kubernetesIngestor.crossplane.xrds.taskRunner.timeout 600
        | upsert kubernetesIngestor.crossplane.xrds.ingestAllXRDs true
        | upsert kubernetesIngestor.crossplane.xrds.convertDefaultValuesToPlaceholders true
        | upsert kubernetes {}
        | upsert kubernetes.frontend.podDelete.enabled true
        | upsert kubernetes.serviceLocatorMethod.type "multiTenant"
        | upsert kubernetes.clusterLocatorMethods [{}]
        | upsert kubernetes.clusterLocatorMethods.0.type "config"
        | upsert kubernetes.clusterLocatorMethods.0.clusters [{}]
        | upsert kubernetes.clusterLocatorMethods.0.clusters.0.url "${KUBE_URL}"
        | upsert kubernetes.clusterLocatorMethods.0.clusters.0.name "kind"
        | upsert kubernetes.clusterLocatorMethods.0.clusters.0.authProvider "serviceAccount"
        | upsert kubernetes.clusterLocatorMethods.0.clusters.0.skipTLSVerify true
        | upsert kubernetes.clusterLocatorMethods.0.clusters.0.skipMetricsLookup true
        | upsert kubernetes.clusterLocatorMethods.0.clusters.0.serviceAccountToken "${KUBE_SA_TOKEN}"
        | upsert kubernetes.clusterLocatorMethods.0.clusters.0.caData "${KUBE_CA_DATA}"
        | save app-config.yaml --force

    {
        app: {
            baseUrl: "${BACKSTAGE_HOST}"
        }
        backend: {
            baseUrl: "${BACKSTAGE_HOST}"
            database: {
                client: "pg"
                connection: {
                    host: "${DB_HOST}"
                    port: 5432
                    user: "${user}"
                    password: "${password}"
                }
            }
        }
    } | to yaml | save app-config.production.yaml --force

    open packages/app/src/components/catalog/EntityPage.tsx
        | (
            str replace
            `} from '@backstage/plugin-kubernetes';`
            `} from '@backstage/plugin-kubernetes';

import { CrossplaneAllResourcesTable, CrossplaneResourceGraph, isCrossplaneAvailable } from '@terasky/backstage-plugin-crossplane-resources-frontend';`
        ) | (
            str replace
            `const serviceEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      {overviewContent}
    </EntityLayout.Route>`
            `const serviceEntityPage = (
  <EntityLayout>
    <EntityLayout.Route path="/" title="Overview">
      {overviewContent}
    </EntityLayout.Route>

    <EntityLayout.Route if={isCrossplaneAvailable} path="/crossplane-resources" title="Crossplane Resources">
      <CrossplaneAllResourcesTable />
    </EntityLayout.Route>
    <EntityLayout.Route if={isCrossplaneAvailable} path="/crossplane-graph" title="Crossplane Graph">
      <CrossplaneResourceGraph />
    </EntityLayout.Route>`
        ) | (
            str replace
            `const componentPage = (
  <EntitySwitch>`
            `const componentPage = (
  <EntitySwitch>
    <EntitySwitch.Case if={isComponentType('crossplane-claim')}>
      {serviceEntityPage}
    </EntitySwitch.Case>`
        ) | save packages/app/src/components/catalog/EntityPage.tsx --force

    open packages/backend/src/index.ts
        | (
            str replace
            `backend.start();`
            `backend.add(import('@terasky/backstage-plugin-crossplane-permissions-backend'));
backend.add(import('@terasky/backstage-plugin-kubernetes-ingestor'));
backend.add(import('@terasky/backstage-plugin-scaffolder-backend-module-terasky-utils'));

backend.start();`
        ) | save packages/backend/src/index.ts --force

    cd ..

    get cluster data --create_service_account true

    $"export NODE_OPTIONS=--no-node-snapshot\n" | save --append .env

}

# Builds and publishes a Backstage Docker image and Helm chart
def --env "main build backstage" [
    tag: string
    --image = "ghcr.io/vfarcic/idp-full-backstage"
    --github_org = "vfarcic"
] {

    docker login $image

    cd backstage

    yarn install --immutable

    yarn tsc

    yarn build:backend

    (
        docker buildx build
            --file packages/backend/Dockerfile
            --tag $"($image):($tag)"
            --platform linux/amd64
            .
    )

    docker image push $"($image):($tag)"

    cd ..

    open charts/backstage/Chart.yaml
        | upsert version $tag
        | upsert appVersion $tag
        | save charts/backstage/Chart.yaml --force

    open charts/backstage/values.yaml
        | upsert image.repository $image
        | upsert image.tag $tag
        | save charts/backstage/values.yaml --force

    helm package charts/backstage

    helm push $"backstage-($tag).tgz" $"oci://ghcr.io/($image)"

    start $"https://github.com/users/($github_org)/packages/container/package/idp-full-backstage"

    print $"
Click (ansi yellow_bold)Package settings(ansi reset).
Click the (ansi yellow_bold)Change visibility(ansi reset) button, select (ansi yellow_bold)Public(ansi reset), type (ansi yellow_bold)idp-full-backstage(ansi reset) to confirm, and click the (ansi yellow_bold)I understand the consequences, change package visibility(ansi reset) button.
Press the (ansi yellow_bold)enter key(ansi reset) to continue.
"
    input

    start $"https://github.com/users/($github_org)/packages/container/package/idp-full-backstage%2Fbackstage"

    print $"
Click (ansi yellow_bold)Package settings(ansi reset).
Click the (ansi yellow_bold)Change visibility(ansi reset) button, select (ansi yellow_bold)Public(ansi reset), type (ansi yellow_bold)idp-full-backstage/backstage(ansi reset) to confirm, and click the (ansi yellow_bold)I understand the consequences, change package visibility(ansi reset) button.
Press the (ansi yellow_bold)enter key(ansi reset) to continue.
"
    input

    rm $"backstage-($tag).tgz"

}

# Deploys Backstage to Kubernetes with necessary configuration
def --env "main apply backstage" [
    tag: string                                   # Available versions can be seen at https://github.com/users/vfarcic/packages/container/idp-full-backstage%2Fbackstage/versions
    --kubeconfig = "kubeconfig-dot.yaml"
    --ingress_host = "backstage.127.0.0.1.nip.io"
    --github_token = "FIXME"
    --create_service_account = false
    --disable_default_workload_types = false
] {

    let cluster_data = (
        get cluster data  
            --kubeconfig $kubeconfig
            --create_service_account $create_service_account
    )

    {
        apiVersion: "v1"
        kind: "Secret"
        metadata: {
            name: "backstage-config"
            namespace: "backstage"
        }
        type: "Opaque"
        data: {
            KUBE_URL: ($cluster_data.kube_url | encode base64)
            KUBE_SA_TOKEN: $cluster_data.token_encoded
            KUBE_CA_DATA: ($cluster_data.kube_ca_data | encode base64)
            GITHUB_TOKEN: ($github_token | encode base64)
        }
    }
        | to yaml
        | kubectl --namespace backstage apply --filename -

    (
        helm upgrade --install cnpg cloudnative-pg
            --repo https://cloudnative-pg.github.io/charts
            --namespace cnpg-system --create-namespace --wait
    )

    (
        helm upgrade --install backstage
            oci://ghcr.io/vfarcic/idp-full-backstage/backstage
            --namespace backstage --create-namespace
            --set $"ingress.host=($ingress_host)"
            --set $"ingrestor.disableDefaultWorkloadTypes=($disable_default_workload_types)"
            --version $tag --wait
    )

    sleep 60sec

    print $"Backstage is available at (ansi yellow_bold)http://($ingress_host)(ansi reset)"

    start $"http://($ingress_host)"

}

def "get cluster data" [
    --kubeconfig = "kubeconfig-dot.yaml"
    --create_service_account = false
] {

    if $create_service_account {

        {
            apiVersion: "v1"
            kind: "Namespace"
            metadata: {
                name: "backstage"
            }
        } | to yaml | kubectl apply --filename -

        {
            apiVersion: "v1"
            kind: "ServiceAccount"
            metadata: {
                name: "backstage"
                namespace: "backstage"
            }
        } | to yaml | kubectl apply --filename -

        {
            apiVersion: "v1"
            kind: "Secret"
            metadata: {
                name: "backstage"
                namespace: "backstage"
                annotations: {
                    "kubernetes.io/service-account.name": "backstage"
                }
            }
            type: "kubernetes.io/service-account-token"
        } | to yaml | kubectl apply --filename -

        {
            apiVersion: "rbac.authorization.k8s.io/v1"
            kind: "ClusterRoleBinding"
            metadata: {
                name: "backstage"
            }
            subjects: [{
                kind: "ServiceAccount"
                name: "backstage"
                namespace: "backstage"
            }]
            roleRef: {
                kind: "ClusterRole"
                name: "cluster-admin"
                apiGroup: "rbac.authorization.k8s.io"
            }
        } | to yaml | kubectl apply --filename -

    }

    let kube_url = open $kubeconfig
        | get clusters.0.cluster.server
    $"export KUBE_URL=($kube_url)\n" | save --append .env

    let kube_ca_data = open $kubeconfig
        | get clusters.0.cluster.certificate-authority-data
    $"export KUBE_CA_DATA=($kube_ca_data)\n" | save --append .env

    let token_encoded = (
        kubectl --namespace backstage get secret backstage
            --output yaml
    )
        | from yaml
        | get data.token

    let token = ($token_encoded | decode base64 | decode)
    $"export KUBE_SA_TOKEN=($token)\n" | save --append .env

    {
        kube_url: $kube_url,
        kube_ca_data: $kube_ca_data,
        token_encoded: $token_encoded,
        token: $token
    }

}
