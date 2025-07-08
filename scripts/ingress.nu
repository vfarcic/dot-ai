#!/usr/bin/env nu

# Applies Ingress
#
# Examples:
# > main apply ingress contour --provider aws
def --env "main apply ingress" [
    class = "contour"   # The class of Ingress controller to apply. Available options: traefik, contour, nginx
    --provider = "none" # The cloud provider. Available options: aws, azure, google, upcloud, kind
    --env_prefix = ""   # Prefix to add to environment variables
] {

    if $class == "traefik" {

        (
            helm upgrade --install traefik traefik
                --repo https://helm.traefik.io/traefik
                --namespace traefik --create-namespace --wait
        )

    } else if $class == "contour" {

        (
            helm upgrade --install contour 
                oci://registry-1.docker.io/bitnamicharts/contour
                --namespace contour --create-namespace --wait
        )
    
    } else if $class == "nginx" {

        if $provider == "kind" {

            (
                kubectl apply
                    --filename https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
            )

            sleep 10sec

            (
                kubectl --namespace ingress-nginx wait
                    --for=condition=Available
                    deployment ingress-nginx-controller
            )

            sleep 5sec

        }

    } else {

        print $"(ansi red_bold)($class)(ansi reset) is not a supported."
        exit 1

    }

    main get ingress $class --provider $provider --env_prefix $env_prefix

}

# Gets the IP and hostname for an Ingress controller
#
# Examples:
# > main get ingress contour --provider aws
# > main get ingress nginx --provider kind --env_prefix TEST_
def "main get ingress" [
    class = "traefik" # The class of Ingress controller to apply. Available options: traefik, contour, nginx
    --provider: string # The cloud provider. Available options: aws, azure, google, upcloud, kind
    --env_prefix = ""  # Prefix to add to environment variables
] {

    mut service_name = $class

    if $class == "contour" {
        $service_name = "contour-envoy"
    }
    
    mut ingress_ip = ""
  
    if $provider == "aws" or $provider == "upcloud" {

        sleep 30sec

        let ingress_hostname = (
            kubectl --namespace $class
                get service $service_name --output yaml
                | from yaml
                | get status.loadBalancer.ingress.0.hostname
        )

        while $ingress_ip == "" {
            print "Waiting for Ingress Service IP..."
            sleep 10sec
            $ingress_ip = (dig +short $ingress_hostname)
        }

        $ingress_ip = $ingress_ip | lines | first

    } else if $provider == "kind" {

        $ingress_ip = "127.0.0.1"

    } else {

        while $ingress_ip == "" {

            print $"Waiting for ($class) Ingress IP from ($service_name) Service..."

            sleep 10sec

            $ingress_ip = (
                kubectl --namespace $class
                    get service $service_name --output yaml
                    | from yaml
                    | get status.loadBalancer.ingress.0.ip
            )

        }
    }

    $"export ($env_prefix)INGRESS_IP=($ingress_ip)\n" | save --append .env
    $"export ($env_prefix)INGRESS_HOST=($ingress_ip).nip.io\n" | save --append .env

    {ip: $ingress_ip, host: $"($ingress_ip).nip.io", class: $class}

}

# Deletes an Ingress controller
#
# Examples:
# > main delete ingress contour
# > main delete ingress traefik
def --env "main delete ingress" [
    class = "contour"   # The class of Ingress controller to apply. Available options: traefik, contour, nginx
] {

    print $"Uninstalling (ansi yellow_bold)Ingress(ansi reset)..."

    if $class == "traefik" {

        helm uninstall traefik --namespace traefik

    } else if $class == "contour" {

        helm uninstall contour  --namespace contour
    
    }

}