#!/usr/bin/env nu

# Builds a container image
def "main run tests" [
    --language = "go" # The language of the project; supported values: `go`
] {

    if $language == "go" {
        go test -v $"(pwd)/..."
    }

}
