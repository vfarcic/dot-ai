#!/usr/bin/env nu

# Installs Cloud-Native PostgreSQL (CNPG) operator
def "main apply cnpg" [] {

     print $"\nInstalling (ansi yellow_bold)Cloud-Native PostgreSQL \(CNPG\)(ansi reset)...\n"

    (
        helm upgrade --install cnpg cloudnative-pg
            --repo https://cloudnative-pg.github.io/charts
            --namespace cnpg-system --create-namespace --wait
    )

}
