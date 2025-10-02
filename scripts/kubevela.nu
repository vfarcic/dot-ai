#!/usr/bin/env nu

# Installs KubeVela platform
#
# Examples:
# > main apply kubevela example.com --ingress_class nginx
def "main apply kubevela" [
    host: string
    --ingress_class = "nginx"
] {

    vela install

    # (
    #     vela addon enable velaux
    #         $"domain=vela.($host)"
    #         $"gatewayDriver=($ingress_class)"
    # )

    # start $"http://($host)"

}
