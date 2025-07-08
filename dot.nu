#!/usr/bin/env nu

source scripts/kubernetes.nu
source scripts/common.nu
source scripts/crossplane.nu
source scripts/ingress.nu

def main [] {}

def "main setup" [] {
    
    rm --force .env

    main create kubernetes kind

    cp kubeconfig-dot.yaml kubeconfig.yaml

    main apply ingress nginx --provider kind

    main apply crossplane --preview true --app-config true

    kubectl create namespace a-team

    kubectl create namespace b-team

    main print source

}

def "main destroy" [] {

    main destroy kubernetes kind

}
