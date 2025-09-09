#!/usr/bin/env nu

# Installs Stacklock Toolhive
#
# Examples:
# > main apply toolhive
def "main apply toolhive" [] {

    (
        helm upgrade --install toolhive-operator-crds
            oci://ghcr.io/stacklok/toolhive/toolhive-operator-crds
    )

    (
        helm upgrade --install toolhive-operator
            oci://ghcr.io/stacklok/toolhive/toolhive-operator
            --namespace toolhive-system --create-namespace
            --wait
    )

}
