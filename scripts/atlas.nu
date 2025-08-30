#!/usr/bin/env nu

# Installs the Atlas Operator for database schema migrations
def "main apply atlas" [] {

    print $"\nInstalling (ansi yellow_bold)Atlas Operator(ansi reset)...\n"

    (
        helm upgrade --install atlas-operator 
            oci://ghcr.io/ariga/charts/atlas-operator 
            --namespace atlas-operator --create-namespace
            --wait
    )

}
