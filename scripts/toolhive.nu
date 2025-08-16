#!/usr/bin/env nu

# Installs Stacklock Toolhive operator for deploying MCP servers
def "main apply toolhive" [] {

    print "Installing Toolhive CRDs..."
    helm upgrade --install toolhive-operator-crds oci://ghcr.io/stacklok/toolhive/toolhive-operator-crds

    print $"Installing Toolhive operator in namespace: toolhive-system..."

    (
        helm upgrade --install toolhive-operator oci://ghcr.io/stacklok/toolhive/toolhive-operator
            --namespace toolhive-system --create-namespace
            --wait
    )

    print "✅ Toolhive operator installed successfully"

}
