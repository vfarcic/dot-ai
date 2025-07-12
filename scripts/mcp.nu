#!/usr/bin/env nu

# Creates the MCP servers configuration file.
#
# Usage:
# > main apply mcp
# > main apply mcp --location my-custom-path.json
# > main apply mcp --location [ my-custom-path.json, another-path.json ]
# > main apply mcp --memory-file-path /custom/memory.json --anthropic-api-key XYZ --github-token ABC
# > main apply mcp --enable-playwright
# > main apply mcp --enable-context7
# > main apply mcp --enable-git
# > main apply mcp --enable-dot-ai --kubeconfig /path/to/kubeconfig
# > main apply mcp --enable-taskmaster
# > main apply mcp --enable-memory
# > main apply mcp --enable-github
#
def --env "main apply mcp" [
    --location: list<string> = [".mcp.json"], # Path(s) where the MCP servers configuration file will be created (e.g., `".cursor/mcp.json", ".roo/mcp.json", ".vscode/mcp.json", "mcp.json"`)
    --memory-file-path: string = "",         # Path to the memory file for the memory MCP server. If empty, defaults to an absolute path for 'memory.json' in CWD.
    --anthropic-api-key: string = "",        # Anthropic API key for the taskmaster-ai MCP server. If empty, $env.ANTHROPIC_API_KEY is used if set.
    --github-token: string = "",             # GitHub Personal Access Token for the github MCP server. If empty, $env.GITHUB_TOKEN is used if set.
    --kubeconfig: string = "",               # Path to kubeconfig file for dot-ai MCP server. If empty, $env.KUBECONFIG is used if set.
    --enable-playwright = false,             # Enable Playwright MCP server for browser automation
    --enable-context7 = false,               # Enable Context7 MCP server
    --enable-git = false,                    # Enable Git MCP server
    --enable-dot-ai = false,                 # Enable dot-ai MCP server
    --enable-taskmaster = false,             # Enable taskmaster-ai MCP server (requires Anthropic API key)
    --enable-memory = false,                 # Enable memory MCP server
    --enable-github = false                  # Enable GitHub MCP server (requires GitHub token)
] {
    let resolved_memory_file_path = if $memory_file_path == "" {
        (pwd) | path join "memory.json" | path expand
    } else {
        $memory_file_path
    }

    let resolved_anthropic_api_key = if $anthropic_api_key != "" {
        $anthropic_api_key
    } else if ("ANTHROPIC_API_KEY" in $env) {
        $env.ANTHROPIC_API_KEY
    } else {
        ""
    }

    let resolved_github_token = if $github_token != "" {
        $github_token
    } else if ("GITHUB_TOKEN" in $env) {
        $env.GITHUB_TOKEN
    } else {
        ""
    }

    let resolved_kubeconfig = if $kubeconfig != "" {
        $kubeconfig
    } else if ("KUBECONFIG" in $env) {
        $env.KUBECONFIG
    } else {
        ""
    }

    mut mcp_servers_map = {}

    if $enable_memory {
        $mcp_servers_map = $mcp_servers_map | upsert "memory" {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-memory"],
            env: {
                MEMORY_FILE_PATH: $resolved_memory_file_path
            }
        }
    }

    if $enable_context7 {
        $mcp_servers_map = $mcp_servers_map | upsert "context7" {
            command: "npx",
            args: ["-y", "@upstash/context7-mcp"]
        }
    }

    if $enable_taskmaster and $resolved_anthropic_api_key != "" {
        $mcp_servers_map = $mcp_servers_map | upsert "taskmaster" {
            command: "npx",
            args: ["-y", "--package=task-master-ai", "task-master-ai"],
            env: {
                ANTHROPIC_API_KEY: $resolved_anthropic_api_key
            }
        }
    }

    if $enable_github and $resolved_github_token != "" {
        $mcp_servers_map = $mcp_servers_map | upsert "github" {
            command: "docker",
            args: ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
            env: {
                GITHUB_PERSONAL_ACCESS_TOKEN: $resolved_github_token
            }
        }
    }

    if $enable_playwright {
        $mcp_servers_map = $mcp_servers_map | upsert "playwright" {
            command: "npx",
            args: ["-y", "@playwright/mcp@latest"]
        }
    }

    if $enable_git {
        $mcp_servers_map = $mcp_servers_map | upsert "git" {
            command: "uvx",
            args: ["mcp-server-git"]
        }
    }

    if $enable_dot_ai and $resolved_anthropic_api_key != "" and $resolved_kubeconfig != "" {
        $mcp_servers_map = $mcp_servers_map | upsert "dot-ai" {
            command: "npx",
            args: ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
            env: {
                ANTHROPIC_API_KEY: $resolved_anthropic_api_key,
                KUBECONFIG: $resolved_kubeconfig,
                DOT_AI_SESSION_DIR: "./tmp/sessions"
            }
        }
    }

    let config_record = { mcpServers: $mcp_servers_map }

    for $output_location in $location {
        let parent_dir = $output_location | path dirname
        if not ($parent_dir | path exists) {
            mkdir $parent_dir
            print $"Created directory: ($parent_dir)"
        }
        $config_record | to json --indent 2 | save -f $output_location
        print $"MCP servers configuration file created at: ($output_location)"
    }
} 