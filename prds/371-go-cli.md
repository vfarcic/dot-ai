# PRD #371: Auto-Generated Go CLI

## Problem Statement

dot-ai currently only exposes its tools via MCP and REST API. There is a growing trend of AI agents preferring CLI tools over MCP servers due to better token efficiency (~33% improvement in benchmarks), simpler configuration (no per-client MCP setup), and composability (piping, scripting). Users in the Kubernetes ecosystem universally expect single-binary CLI tools — kubectl, helm, terraform, and gh are all self-contained binaries. Without a CLI, dot-ai requires either MCP configuration or raw HTTP calls, creating friction for both AI agents and human users.

## Solution Overview

Create a Go-based CLI that is **auto-generated from the server's OpenAPI spec**. The server already generates an OpenAPI 3.0 spec from its tool and route definitions. The Go CLI embeds this spec via `go:embed` and derives all commands, flags, and help text from it at compile time. It compiles to self-contained binaries for all major OS/arch combinations.

The CLI is just another REST API client — it talks to the server the same way the planned Web UI (PRD #109) would, via standard HTTP requests. Unlike MCP (limited to 8 high-level tools to minimize context window usage), the CLI exposes **all REST API endpoints** since there's no token cost per command.

```
Server build → export openapi.json → Go embeds it → go build → multi-arch binaries
                                          ↓
                              Parses OpenAPI paths → CLI commands
```

## User Experience

```bash
# Install (single binary, no runtime dependencies)
curl -sL https://github.com/vfarcic/dot-ai/releases/latest/download/dot-ai-darwin-arm64 \
  -o /usr/local/bin/dot-ai && chmod +x /usr/local/bin/dot-ai

# AI-powered tools (same as MCP, but via CLI)
dot-ai query "what pods are running?"
dot-ai remediate "nginx pod crashlooping"
dot-ai recommend "deploy postgres database"
dot-ai operate "scale nginx to 3 replicas"
dot-ai version

# Direct resource access (NOT available via MCP — CLI exclusive)
dot-ai resources --kind Deployment --namespace default
dot-ai events --name nginx --kind Deployment
dot-ai logs --name nginx-pod --namespace default --tailLines 50
dot-ai namespaces

# Sessions and visualization
dot-ai visualize rec-abc123
dot-ai sessions rec-abc123

# Knowledge base
dot-ai knowledge ask --query "how to configure postgres?"

# Complex tool params via flags
dot-ai recommend --intent "deploy postgres" --stage chooseSolution --solutionId sol_123
dot-ai manageOrgData --dataType pattern --operation list

# Global options (work with any command)
dot-ai query "test" --server-url http://remote:3456 --token mytoken --output json
```

## Architecture

The CLI is a peer of the Web UI — both are thin HTTP clients over the same REST API:

```
CLI     →  HTTP (GET/POST/DELETE)  →  REST API Server
Web UI  →  HTTP (GET/POST/DELETE)  →  REST API Server
MCP     →  MCP Protocol           →  MCP Server
```

### How auto-generation works

1. **Server build** exports the OpenAPI spec to `packages/cli/openapi.json`
2. **Go CLI** embeds `openapi.json` via `go:embed`
3. At startup, Go parses the OpenAPI paths and schemas to register cobra subcommands dynamically
4. When server tools/routes change → re-export OpenAPI → rebuild Go binary
5. Zero manual Go code changes needed for new endpoints

### OpenAPI → CLI mapping rules

| OpenAPI Pattern | CLI Command | Parameters |
|----------------|-------------|------------|
| `POST /api/v1/tools/query` | `dot-ai query` | Body properties → flags. Single required string → positional arg |
| `GET /api/v1/resources` | `dot-ai resources` | Query params → flags |
| `GET /api/v1/events` | `dot-ai events` | Query params → flags |
| `GET /api/v1/logs` | `dot-ai logs` | Query params → flags |
| `GET /api/v1/visualize/:sessionId` | `dot-ai visualize <sessionId>` | Path params → positional args |
| `DELETE /api/v1/knowledge/source/:id` | `dot-ai knowledge delete <sourceId>` | Path params → positional args |

### Go CLI structure

```
packages/cli/
├── go.mod
├── go.sum
├── openapi.json               # Embedded via go:embed (auto-generated from server)
├── main.go                    # Entry point
├── cmd/
│   ├── root.go                # Root command, global flags
│   └── dynamic.go             # OpenAPI → cobra command registration
├── internal/
│   ├── client/
│   │   └── client.go          # HTTP client (GET/POST/DELETE)
│   ├── config/
│   │   └── config.go          # Server URL, token, output format
│   ├── openapi/
│   │   └── parser.go          # Parse embedded OpenAPI spec → command defs
│   └── formatter/
│       ├── text.go            # Human-readable output (default)
│       ├── json.go            # Raw JSON passthrough
│       └── yaml.go            # YAML output
└── Makefile                   # Build targets for all OS/arch
```

## Technical Decisions

### Why Go?
- Single binary, no runtime dependencies — matches kubectl, helm, terraform
- Built-in cross-compilation for all OS/arch
- ~10ms startup vs ~300ms for Node.js
- Standard in the Kubernetes ecosystem

### Go dependencies (minimal)
- `github.com/spf13/cobra` — CLI framework (same as kubectl, helm)
- `gopkg.in/yaml.v3` — YAML output formatting
- Standard library for HTTP client, JSON, embed

### Why generate from OpenAPI instead of Zod schemas?
- OpenAPI spec already exists — generated by `src/interfaces/openapi-generator.ts`
- Standard format with rich Go tooling
- Language-neutral contract between server and CLI
- No custom TypeScript generator needed — just export the spec
- Includes both MCP tools AND direct REST routes in one spec

### Why expose all endpoints, not just MCP tools?
- MCP limits tools to 8 to reduce context window usage — that constraint doesn't apply to CLI
- CLI commands cost nothing in `--help` — one line each
- Makes CLI strictly more capable than MCP (resources, logs, events, visualizations)
- All endpoints are already in the OpenAPI spec

### Configuration precedence
1. CLI flags: `--server-url`, `--token`, `--output`
2. Environment variables: `DOT_AI_SERVER_URL`, `DOT_AI_AUTH_TOKEN`, `DOT_AI_OUTPUT_FORMAT`
3. Defaults: `http://localhost:3456`, no token, `text`

### Output formats
- `text` (default): Human-readable, extracts key fields (summary, sessionId, guidance). Tables for resource lists. Follows K8s ecosystem convention (kubectl, helm all default to text).
- `json`: Raw JSON passthrough of full REST API response. Agents should use `--output json`.
- `yaml`: YAML serialization of response

### Exit codes
- 0: Success
- 1: Tool execution error (server returned error)
- 2: Connection error (server unreachable)
- 3: Usage error (invalid args, missing required params)

## Success Criteria

1. `dot-ai --help` shows all commands (MCP tools + resources + events + logs + ...) — works offline
2. `dot-ai <command> --help` shows parameters with types and descriptions — works offline
3. `dot-ai query "what pods are running?"` executes against running server
4. `dot-ai resources --kind Deployment` returns resource list
5. `dot-ai version --output json` returns raw JSON
6. Single binary, no runtime dependencies, builds for linux/amd64, linux/arm64, darwin/amd64, darwin/arm64
7. Re-exporting OpenAPI after tool/route changes updates CLI with zero manual Go code changes

## Milestones

- [ ] **M1: OpenAPI export** — Script/npm command to export server's OpenAPI spec to `packages/cli/openapi.json`
- [ ] **M2: Go CLI scaffold** — `packages/cli/` with cobra, embedded OpenAPI, root command with global flags (`--server-url`, `--token`, `--output`, `--help`)
- [ ] **M3: OpenAPI parser** — Go code parses embedded OpenAPI spec into command definitions (name, description, method, path, params with types)
- [ ] **M4: Dynamic command generation** — Cobra subcommands registered from parsed OpenAPI. `--help` works for all commands. Positional args for primary params and path params, flags for the rest
- [ ] **M5: HTTP client and execution** — GET/POST/DELETE with query params, JSON body, Bearer auth, error handling (connection, 401, 404, 500, timeout)
- [ ] **M6: Output formatters** — text (human-readable), json (passthrough), yaml
- [ ] **M7: Multi-arch build** — Makefile for linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64
- [ ] **M8: Integration tests** — OpenAPI parsing, CLI help, tool execution, error scenarios, output formats
- [ ] **M9: Documentation** — Installation instructions, usage examples, AI agent integration guide
- [ ] **M10: Shell completion** — Bash, Zsh, and Fish completion scripts via cobra's built-in completion generation
- [ ] **M11: Interactive mode** — REPL for running multiple commands in a session without reconnecting
- [ ] **M12: Streaming responses** — SSE support for long-running operations (remediate, recommend) to show progress in real time

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Go adds a new language to the project | CLI is isolated in `packages/cli/`, minimal Go code (~500-700 lines). All server code stays TypeScript. |
| OpenAPI spec gets out of sync with CLI | CI check: export OpenAPI, compare with embedded copy, fail if different. |
| Complex tool params hard to map to CLI flags | Use JSON string for object/array params: `--answers '{"key":"value"}'`. Document in help. |
| Some endpoints may not be useful as CLI commands | Can add an exclude list in the OpenAPI parser for internal endpoints. |

## Dependencies

- OpenAPI spec generation — already implemented (`src/interfaces/openapi-generator.ts`)
- REST API endpoints — already implemented (`src/interfaces/rest-api.ts`, `src/interfaces/routes/index.ts`)
- All 18 REST routes with Zod schemas — already defined (`src/interfaces/routes/index.ts`)
