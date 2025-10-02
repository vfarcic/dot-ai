#!/usr/bin/env nu

# Installs and configures AWS Controllers for Kubernetes (ACK)
#
# Examples:
# > main apply ack --cluster_name my-cluster --region us-west-2
def --env "main apply ack" [
    --cluster_name = "dot"
    --region = "us-east-1"
    --apply_irsa = true
] {

    print $"\nApplying (ansi yellow_bold)ACK Controllers(ansi reset)...\n"

    if AWS_ACCESS_KEY_ID not-in $env {
        $env.AWS_ACCESS_KEY_ID = input $"(ansi yellow_bold)Enter AWS Access Key ID: (ansi reset)"
    }
    $"export AWS_ACCESS_KEY_ID=($env.AWS_ACCESS_KEY_ID)\n"
        | save --append .env

    if AWS_SECRET_ACCESS_KEY not-in $env {
        $env.AWS_SECRET_ACCESS_KEY = input $"(ansi yellow_bold)Enter AWS Secret Access Key: (ansi reset)"
    }
    $"export AWS_SECRET_ACCESS_KEY=($env.AWS_SECRET_ACCESS_KEY)\n"
        | save --append .env

    let password = (
        aws ecr-public get-login-password --region us-east-1
    )

    (
        helm registry login --username AWS --password $password 
            public.ecr.aws
    )

    mut aws_account_id = ""
    mut oidc_provider = ""

    if $apply_irsa {

        if AWS_ACCOUNT_ID in $env {
            $aws_account_id = $env.AWS_ACCOUNT_ID
        } else {
            $aws_account_id = (
                aws sts get-caller-identity --query "Account"
                    --output text
            )
        }

        if OIDC_PROVIDER in $env {
            $oidc_provider = $env.OIDC_PROVIDER
        } else {
            $oidc_provider = (
                aws eks describe-cluster --name $cluster_name
                    --region $region
                    --query "cluster.identity.oidc.issuer"
                    --output text | str replace "https://" ""
            )
        }

    }

    let controllers = [
        {name: "ec2", version: "1.3.7"},
        {name: "rds", version: "1.4.14"},
    ]
    for controller in $controllers {

        let ack_controller_iam_role = $"ack-($controller.name)-controller"

        (
            helm upgrade --install $ack_controller_iam_role
                oci://public.ecr.aws/aws-controllers-k8s/($controller.name)-chart
                $"--version=($controller.version)"
                --create-namespace --namespace ack-system
                --set aws.region=us-east-1
        )

        if $apply_irsa {

            {
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Principal: {
                            Federated: $"arn:aws:iam::($aws_account_id):oidc-provider/($oidc_provider)"
                        },
                        "Action": "sts:AssumeRoleWithWebIdentity",
                        "Condition": {
                            "StringEquals": {
                                $"($oidc_provider):sub": $"system:serviceaccount:ack-system:($ack_controller_iam_role)"
                            }
                        }
                    }
                ]
            } | to json | save trust.json --force

            do --ignore-errors {(
                aws iam create-role
                    --role-name $ack_controller_iam_role
                    --assume-role-policy-document file://trust.json
                    --description $"IRSA role for ACK ($controller.name) controller deployment on EKS cluster using Helm charts"
            )}

            let policy_arns = (
                get policy_arns --controller $controller.name
            )

            for policy_arn in $policy_arns {(
                aws iam attach-role-policy
                    --role-name $ack_controller_iam_role
                    --policy-arn $policy_arn
            )}

            let role_arn = (
                aws iam get-role --role-name $ack_controller_iam_role
                    --query Role.Arn --output text
            )

            (
                kubectl --namespace ack-system
                    annotate serviceaccount $ack_controller_iam_role
                    $"eks.amazonaws.com/role-arn=($role_arn)"
            )

            (
                kubectl --namespace ack-system
                    rollout restart deployment
                    $"($ack_controller_iam_role)-($controller.name)-chart"
            )

            (
                kubectl --namespace ack-system wait
                    --for=condition=ready pods
                    --selector $"app.kubernetes.io/instance=($ack_controller_iam_role)"
            )

        }

    }

}

# Removes AWS Controllers for Kubernetes (ACK) and deletes associated IAM roles
def --env "main delete ack" [] {

    let controllers = [
        "ec2",
        "rds"
    ]
    for controller in $controllers {

        let ack_controller_iam_role = $"ack-($controller)-controller"

        let policy_arns = (
            get policy_arns --controller $controller
        )

        for policy_arn in $policy_arns {
            
        do --ignore-errors {(
            aws iam detach-role-policy
                --role-name ($ack_controller_iam_role)
                --policy-arn ($policy_arn)
            )}
        }

        aws iam delete-role --role-name $ack_controller_iam_role

    }

}

def "get policy_arns" [
    --controller = "ec2"
] {
    
    let base_url = $"https://raw.githubusercontent.com/aws-controllers-k8s/($controller)-controller/main"

    let policy_arn_url = $"($base_url)/config/iam/recommended-policy-arn"

    http get $policy_arn_url | lines

}