# REST API Gateway

**Complete guide for accessing DevOps AI Toolkit functionality via standard HTTP REST endpoints.**

## Overview

The REST API Gateway provides HTTP access to all DevOps AI Toolkit capabilities without requiring MCP protocol implementation. Perfect for:

- **DevOps Engineers**: Integrate tools into automation scripts and CI/CD pipelines
- **Platform Teams**: Add AI-powered Kubernetes assistance to existing HTTP-based infrastructure  
- **QA/Testing Teams**: Create comprehensive integration tests with simple HTTP calls
- **Kubernetes Controller Developers**: Access AI tools via familiar REST patterns

### What it provides:
- **Universal Tool Access**: All 9 tools available via `POST /api/v1/tools/{toolName}` endpoints
- **Auto-Generated Documentation**: OpenAPI 3.0 specification with interactive documentation
- **Zero Maintenance**: Automatically stays current when new tools are added
- **Standard HTTP**: JSON request/response with proper status codes
- **Tool Discovery**: Searchable catalog of available tools and capabilities

## Setup

The REST API is automatically available when you deploy the DevOps AI Toolkit. **No special configuration is needed** - the same server provides MCP protocol, CLI, and REST API access simultaneously.

**🎯 Follow the [Deployment Guide](../setup/deployment.md) to deploy the server.**

The Kubernetes deployment automatically provides:
- ✅ **REST API endpoints** on the configured ingress URL  
- ✅ **MCP protocol access** for AI development tools
- ✅ **All dependencies** including Qdrant vector database
- ✅ **Both protocols simultaneously** with no conflicts

## Quick Start

### 1. Discover Available Tools

```bash
curl -s http://localhost:3456/api/v1/tools | jq '.data.tools[] | {name, description, category}'
```

**Response**: List of 9 available tools with descriptions:
```json
[
  {
    "name": "version",
    "description": "Get comprehensive system status including version information, Vector DB connection status, embedding service capabilities, Anthropic API connectivity, Kubernetes cluster connectivity, Kyverno policy engine status, and pattern management health check",
    "category": "System"
  },
  {
    "name": "recommend", 
    "description": "Deploy, create, setup, install, or run applications, infrastructure, and services on Kubernetes with AI recommendations",
    "category": "AI Tools"
  },
  {
    "name": "remediate",
    "description": "AI-powered Kubernetes issue analysis that provides root cause identification and actionable remediation steps",
    "category": "Troubleshooting"
  }
]
```

### 2. Get System Status

```bash
curl -s -X POST http://localhost:3456/api/v1/tools/version \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response**: Comprehensive system status (truncated):
```json
{
  "success": true,
  "data": {
    "result": {
      "status": "success",
      "system": {
        "version": {
          "version": "0.90.0",
          "nodeVersion": "v23.11.0",
          "platform": "darwin"
        },
        "vectorDB": {
          "connected": true,
          "collections": {
            "patterns": {"exists": true, "documentsCount": 3},
            "policies": {"exists": true, "documentsCount": 3},
            "capabilities": {"exists": true, "documentsCount": 157}
          }
        },
        "kubernetes": {
          "connected": true,
          "context": "kind-kind"
        }
      }
    }
  }
}
```

### 3. Access Interactive API Documentation

```bash
# Get OpenAPI specification
curl -s http://localhost:3456/api/v1/openapi | jq '.info'
```

**Response**: OpenAPI 3.0 specification with all tool schemas:
```json
{
  "title": "DevOps AI Toolkit REST API",
  "description": "REST API gateway for DevOps AI Toolkit tools",
  "version": "1.0.0",
  "contact": {
    "name": "Viktor Farcic",
    "url": "https://devopstoolkit.live/"
  }
}
```

## API Reference

### Base URL and Versioning

**Base URL**: `http://localhost:3456/api/v1`

All endpoints use `/api/v1/` prefix for versioning. Future API changes will use new version paths (`/api/v2/`) maintaining backward compatibility.

### Core Endpoints

#### Tool Discovery
```http
GET /api/v1/tools
```

**Query Parameters**:
- `category` - Filter by tool category (e.g., "AI Tools", "System", "Troubleshooting")
- `tag` - Filter by a single tag (e.g., "kubernetes", "deployment", "analysis") 
- `search` - Search tool names and descriptions

**Examples**:
```bash
# Get all AI-powered tools
curl "http://localhost:3456/api/v1/tools?category=AI%20Tools"

# Find deployment-related tools
curl "http://localhost:3456/api/v1/tools?tag=deployment"

# Search for troubleshooting tools
curl "http://localhost:3456/api/v1/tools?search=troubleshoot"
```

#### Tool Execution
```http
POST /api/v1/tools/{toolName}
Content-Type: application/json
```

**Request Body**: Tool-specific parameters (see OpenAPI spec for schemas)
**Response**: Standardized JSON response with tool results

#### OpenAPI Documentation
```http
GET /api/v1/openapi
```

Returns complete OpenAPI 3.0 specification with:
- All tool endpoints and schemas
- Parameter descriptions and validation rules
- Response formats and error codes
- Interactive documentation support

### Response Format

All REST API responses follow this standard format:

```json
{
  "success": boolean,
  "data": {
    "result": any,           // Tool execution result
    "tool": string,          // Tool name
    "executionTime": number  // Execution time in milliseconds
  },
  "error": {                 // Only present if success: false
    "code": string,
    "message": string,
    "details": any
  },
  "meta": {
    "timestamp": string,     // ISO 8601 timestamp
    "requestId": string,     // Unique request identifier
    "version": string        // API version
  }
}
```

### HTTP Status Codes

- **200 OK**: Successful tool execution
- **400 Bad Request**: Invalid request parameters or missing required fields
- **404 Not Found**: Tool does not exist
- **405 Method Not Allowed**: Invalid HTTP method (tools only accept POST)
- **500 Internal Server Error**: Tool execution failure or server error

## Tool Discovery and Filtering

Instead of listing all tools statically, use the API to discover available tools dynamically:

### Discover All Tools
```bash
curl http://your-ingress-url/api/v1/tools | jq '.data.tools[] | {name, description, category}'
```

### Filter by Category
```bash
# Get all AI-powered tools
curl "http://your-ingress-url/api/v1/tools?category=AI%20Tools"

# Available categories: AI Tools, Deployment, Management, System, Troubleshooting, Documentation
```

### Filter by Tags
```bash
# Find deployment-related tools
curl "http://your-ingress-url/api/v1/tools?tags=deployment"

# Find troubleshooting tools
curl "http://your-ingress-url/api/v1/tools?tags=troubleshooting"
```

### Search Tools
```bash
# Search for specific functionality
curl "http://your-ingress-url/api/v1/tools?search=kubernetes"
curl "http://your-ingress-url/api/v1/tools?search=database"
```

### Get Complete Tool Documentation
For detailed parameter schemas and usage instructions:
```bash
# Get OpenAPI specification with all tool schemas
curl http://your-ingress-url/api/v1/openapi | jq '.paths'
```

## Prompts Endpoints

Three REST endpoints expose the shared prompt library. Each one accepts an optional `repo` parameter that, when supplied, fetches prompts from that repository instead of the one configured via `DOT_AI_USER_PROMPTS_REPO`. When `repo` is omitted, behavior is identical to the env-var-configured setup.

The override can additionally carry three **optional, additive** qualifiers — a subdirectory (`path`), a `branch`, and a per-request git credential (the `X-Dot-AI-Git-Token` header). They only apply to a request that already supplies `repo`, and each one defaults to today's behavior when omitted: `path` defaults to the repo root, `branch` defaults to `main`, and the credential defaults to the server's `DOT_AI_GIT_TOKEN`.

> **Unchanged by default.** A request that supplies no `path`, no `branch`, and no `X-Dot-AI-Git-Token` header behaves byte-identically to v1.21.0 — same clone target (repo root on `main`), same credential (`DOT_AI_GIT_TOKEN`), same response — whether it uses `?repo=` or the env-var-configured repo (no `?repo=`). All three additions are opt-in per request; existing callers see zero change.

A fourth endpoint — `POST /api/v1/prompts/sources` — works the other way around: instead of the server fetching a repo, the **caller uploads** a skill source it fetched itself, which the server then caches and renders through the same render path. It exists for sources the server cannot reach (SSO/device-gated VPNs, hardened clusters, and on-disk `--repo-dir` dev loops). It is purely additive — deployments and callers that never upload see zero change. See [Ingested (CLI-uploaded) skill sources](#ingested-cli-uploaded-skill-sources) below.

See the [Shared Prompt Library](../tools/prompts.md) for the user-facing tool guide.

### Endpoint Summary

| Endpoint | `repo` / `path` / `branch` / `source` placement | Credential |
|----------|--------------------------------------|------------|
| `POST /api/v1/prompts/refresh` | JSON body: `{ "repo": "<url>", "path": "<subdir>", "branch": "<branch>" }` | `X-Dot-AI-Git-Token` header |
| `GET /api/v1/prompts` | Query string: `?repo=<url>&path=<subdir>&branch=<branch>` | `X-Dot-AI-Git-Token` header |
| `POST /api/v1/prompts/:promptName` | Query string: `?repo=<url>&path=<subdir>&branch=<branch>` (clone) **or** `?source=<identifier>` (render an ingested source) | `X-Dot-AI-Git-Token` header |
| `POST /api/v1/prompts/sources` | JSON body manifest: `{ "source", "contentHash", "files" }` — no `repo`/`path`/`branch` | Never clones (n/a) |

`path` and `branch` follow the same placement as `repo` on each endpoint (query string for `GET` and `POST /:promptName`, JSON body for `refresh`). The credential **always** travels as the `X-Dot-AI-Git-Token` request header — never in the query string or body. See [Per-request `path`, `branch`, and credential](#per-request-path-branch-and-credential) below. The `?source=` render signal and the `POST /api/v1/prompts/sources` upload endpoint are documented under [Ingested (CLI-uploaded) skill sources](#ingested-cli-uploaded-skill-sources).

> **Every endpoint is bearer-gated.** All of these requests pass through the same bearer-auth check as every non-OpenAPI route (`Authorization: Bearer <token>`). The local-development examples below target `localhost` and omit the header for brevity; a deployed server requires it.

### The `source` field

Every response from these endpoints includes a `source` field identifying which repository the prompts came from.

`source` values:

| Request | `source` value |
|---------|----------------|
| `repo` parameter supplied | The supplied URL (credentials scrubbed) |
| `repo` omitted, `DOT_AI_USER_PROMPTS_REPO` set | The env-var URL (credentials scrubbed) |
| `repo` omitted, no env-var repo | `"built-in"` |

**Credential scrubbing**: URLs with embedded credentials are scrubbed before being echoed back. `https://user:tok@host/repo` becomes `https://***:***@host/repo`. The transform is deterministic, so the same credentialed URL always produces the same `source` value across requests.

> **`source` is keyed on the repo URL only.** Adding `path`, `branch`, or the `X-Dot-AI-Git-Token` header does **not** change the `source` value for a given repo — it still echoes the (scrubbed) override URL and stays stable per repo. This lets a caller use `source` as a stable skill-tagging key regardless of which subdirectory, branch, or credential it pulled with.

### Per-request `path`, `branch`, and credential

These three qualifiers extend a `repo` override so a secondary source can live under a `skills/`-style subdirectory, on a non-default branch, and in a different authentication realm than the server's env-var repo. All three are optional and additive.

| Qualifier | Placement | Default when omitted |
|-----------|-----------|----------------------|
| `path` | `?path=<subdir>` (query) or `"path"` (JSON body) | Repo root |
| `branch` | `?branch=<branch>` (query) or `"branch"` (JSON body) | `main` |
| Credential | `X-Dot-AI-Git-Token` request header (never query/body) | Server's `DOT_AI_GIT_TOKEN` env credential |

**Credential precedence.** When the `X-Dot-AI-Git-Token` header is present, the server clones the override repo with that token **for that request only**; it takes precedence over `DOT_AI_GIT_TOKEN`. When the header is absent, the override clone uses the server's `DOT_AI_GIT_TOKEN` exactly as before. The forwarded token is scoped to the host in `repo` (it is not forwarded across a cross-host redirect) and never appears in logs, error messages, the `source` field, or the cache key.

> **The credential header is inert without `repo`.** A request that sends `X-Dot-AI-Git-Token` but no `?repo=` is unaffected by the header — it is read only to authenticate an override clone. The env-var-configured path never changes behavior based on the header.

The `path` and `branch` values map onto the same layout an env-var repo uses via `DOT_AI_USER_PROMPTS_PATH` / `DOT_AI_USER_PROMPTS_BRANCH` — they are simply supplied per request instead of via deployment configuration.

### `POST /api/v1/prompts/refresh`

Force-refreshes the prompts cache. Use this when you've pushed new prompts to the repository and don't want to wait for `DOT_AI_USER_PROMPTS_CACHE_TTL` to expire.

**Request body** (all fields optional):

| Field | Type | Description |
|-------|------|-------------|
| `repo` | string | Override repository URL (HTTPS). When supplied, bypasses `DOT_AI_USER_PROMPTS_REPO` for this request. |
| `path` | string | Subdirectory within the override repo to load prompts from. Omit for the repo root. Only applies when `repo` is supplied. |
| `branch` | string | Branch of the override repo to clone. Omit for `main`. Only applies when `repo` is supplied. |

The override credential travels as the `X-Dot-AI-Git-Token` header (see [above](#per-request-path-branch-and-credential)), never as a body field.

**Built-in case** (no env-var repo, no override):

```bash
curl -s -X POST http://localhost:3456/api/v1/prompts/refresh \
  -H "Content-Type: application/json" \
  -d '{}'
```

```json
{
    "success": true,
    "data": {
        "refreshed": true,
        "promptsLoaded": 11,
        "source": "built-in"
    },
    "meta": {
        "timestamp": "2026-05-26T19:51:50.367Z",
        "requestId": "rest_1779825110366_3",
        "version": "v1"
    }
}
```

**Per-request override case**:

```bash
curl -s -X POST http://localhost:3456/api/v1/prompts/refresh \
  -H "Content-Type: application/json" \
  -d '{"repo":"https://github.com/vfarcic/dot-ai-user-prompts"}'
```

```json
{
    "success": true,
    "data": {
        "refreshed": true,
        "promptsLoaded": 11,
        "source": "https://github.com/vfarcic/dot-ai-user-prompts"
    },
    "meta": {
        "timestamp": "2026-05-26T19:52:06.738Z",
        "requestId": "rest_1779825126117_6",
        "version": "v1"
    }
}
```

**Credential-scrubbing case**: a credentialed URL is echoed back scrubbed.

```bash
curl -s -X POST http://localhost:3456/api/v1/prompts/refresh \
  -H "Content-Type: application/json" \
  -d '{"repo":"https://user:secrettoken@example.com/repo"}'
```

```json
{
    "success": true,
    "data": {
        "refreshed": true,
        "promptsLoaded": 11,
        "source": "https://***:***@example.com/repo"
    }
}
```

> **Illustrative example** (placeholder token, non-runnable as written). The response shape is shown for reference, not captured from a live run. Replace `<token for that repo>` with a real token — it is scrubbed from logs and never appears in the response.

**Subdirectory + branch + per-request credential**: load prompts from a `skills/` subdirectory on a non-default branch of a private repo, authenticating with a request-supplied token:

```bash
curl -s -X POST http://localhost:3456/api/v1/prompts/refresh \
  -H "Content-Type: application/json" \
  -H "X-Dot-AI-Git-Token: <token for that repo>" \
  -d '{"repo":"https://forgejo.example.com/team/skills","path":"skills","branch":"team-skills"}'
```

The response has the same shape as the per-request override case above. `source` still echoes the override repo URL (`"https://forgejo.example.com/team/skills"`, credentials scrubbed) — unchanged by `path`, `branch`, or the header — while `promptsLoaded` reflects the prompts found under `skills/` on the `team-skills` branch. The token is used only to clone that host and never appears in the response.

### `GET /api/v1/prompts`

Lists all available prompts (built-in plus user-defined). Returns the prompt names, descriptions, and any declared arguments.

**Query parameters** (all optional):

| Parameter | Description |
|-----------|-------------|
| `repo` | Override repository URL (HTTPS). When supplied, bypasses `DOT_AI_USER_PROMPTS_REPO` for this request. |
| `path` | Subdirectory within the override repo to load prompts from. Omit for the repo root. Only applies when `repo` is supplied. |
| `branch` | Branch of the override repo to clone. Omit for `main`. Only applies when `repo` is supplied. |

The override credential travels as the `X-Dot-AI-Git-Token` header (see [above](#per-request-path-branch-and-credential)), never as a query parameter.

**Built-in case**:

```bash
curl -s http://localhost:3456/api/v1/prompts
```

Response (abbreviated — the full response carries every prompt's metadata):

```json
{
    "success": true,
    "data": {
        "prompts": [
            { "name": "generate-cicd", "description": "Generate intelligent CI/CD workflows..." },
            { "name": "generate-dockerfile", "description": "Generate production-ready..." },
            { "name": "prd-create", "description": "Create documentation-first PRDs..." }
        ],
        "source": "built-in"
    }
}
```

**Per-request override case**:

```bash
curl -s "http://localhost:3456/api/v1/prompts?repo=https://github.com/vfarcic/dot-ai-user-prompts"
```

The `source` field echoes the override URL (credentials scrubbed):

```json
{
    "success": true,
    "data": {
        "prompts": [ /* … */ ],
        "source": "https://github.com/vfarcic/dot-ai-user-prompts"
    }
}
```

> **Illustrative example** (placeholder token, non-runnable as written). The response shape is shown for reference, not captured from a live run. Replace `<token for that repo>` with a real token — it is scrubbed from logs and never appears in the response.

**Subdirectory + branch + per-request credential**: list the prompts a private cross-realm source publishes under `skills/` on a non-default branch:

```bash
curl -s "http://localhost:3456/api/v1/prompts?repo=https://forgejo.example.com/team/skills&path=skills&branch=team-skills" \
  -H "X-Dot-AI-Git-Token: <token for that repo>"
```

The response shape is identical to the per-request override case above — the `prompts` array carries whatever lives under `skills/` on the `team-skills` branch, and `source` still echoes `"https://forgejo.example.com/team/skills"` (unaffected by `path`, `branch`, or the header).

### `POST /api/v1/prompts/:promptName`

Returns the rendered content (`messages`, optional `files`) of a single prompt by name.

**Query parameters** (all optional):

| Parameter | Description |
|-----------|-------------|
| `repo` | Override repository URL (HTTPS). When supplied, bypasses `DOT_AI_USER_PROMPTS_REPO` for this request. |
| `path` | Subdirectory within the override repo to load prompts from. Omit for the repo root. Only applies when `repo` is supplied. |
| `branch` | Branch of the override repo to clone. Omit for `main`. Only applies when `repo` is supplied. |
| `source` | Render an already-**ingested** (CLI-uploaded) source by its identifier instead of cloning. Takes precedence over `repo`; the server never clones a `?source=` identifier. See [Ingested (CLI-uploaded) skill sources](#ingested-cli-uploaded-skill-sources). |

The override credential travels as the `X-Dot-AI-Git-Token` header (see [above](#per-request-path-branch-and-credential)), never as a query parameter or body field.

**Request body** (all fields optional):

| Field | Type | Description |
|-------|------|-------------|
| `arguments` | object | Argument values for prompts that declare `arguments` in their frontmatter (substituted via `{{argumentName}}` placeholders). |

**Per-request override example**:

```bash
curl -s -X POST "http://localhost:3456/api/v1/prompts/prd-create?repo=https://github.com/vfarcic/dot-ai-user-prompts" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```json
{
    "success": true,
    "data": {
        "messages": [ /* prompt content */ ],
        "source": "https://github.com/vfarcic/dot-ai-user-prompts"
    }
}
```

> **Illustrative example** (placeholder token, non-runnable as written). The response shape is shown for reference, not captured from a live run. Replace `<token for that repo>` with a real token — it is scrubbed from logs and never appears in the response.

**Subdirectory + branch + per-request credential**: render a prompt that lives under `skills/` on a non-default branch of a private cross-realm repo:

```bash
curl -s -X POST "http://localhost:3456/api/v1/prompts/deploy-app?repo=https://forgejo.example.com/team/skills&path=skills&branch=team-skills" \
  -H "Content-Type: application/json" \
  -H "X-Dot-AI-Git-Token: <token for that repo>" \
  -d '{}'
```

The response carries the rendered `messages` for the prompt resolved under `skills/` on the `team-skills` branch; `source` still echoes `"https://forgejo.example.com/team/skills"`, unchanged by `path`, `branch`, or the header.

## Ingested (CLI-uploaded) skill sources

Every endpoint above has the server **fetch** the source: the caller names a repo and the server clones it. After the per-request credential override, that model reaches any source a server-side clone can authenticate to. Two classes of source remain unreachable — and in both, the laptop where the CLI runs **can** fetch while the server **cannot**:

1. **Sources the server cannot authenticate or route to**, even with a static token — VPNs gated by SSO / OIDC / device attestation, and managed/hardened clusters with no egress path the operator can open.
2. **On-disk directories** — work-in-progress skills on a developer's filesystem with no remote at all.

For these, the CLI fetches the source locally and **uploads** it; the server caches it and renders it through the **same** render path — one renderer, server-side, so a CLI-fetched skill renders byte-identically to one cloned from `?repo=`. Upload via `POST /api/v1/prompts/sources`; render via `POST /api/v1/prompts/:promptName?source=<identifier>`.

> **Bearer-gated, like every endpoint here.** Both the upload and the `?source=` render pass through the same `Authorization: Bearer <token>` check as the rest of the API.

### Source-identifier key space

An uploaded source is keyed by a **stable identifier** that the render request later names verbatim via `?source=`:

| CLI flag | Identifier | Server behavior |
|----------|------------|-----------------|
| `--repo-fetch <git-url>` | the git URL verbatim (credentials scrubbed in echoes) | render from the **ingested** source; the server **never clones** this URL — the whole point is that it cannot reach it |
| `--repo-dir <path> --source-label <label>` | `local:<label>` | render from the ingested source; a `local:` identifier is intrinsically non-clonable |

> **Identifier uniqueness is the caller's responsibility.** The server stores the identifier exactly as sent — it does **not** auto-prefix or namespace per caller in this release. To avoid cross-host collisions, use a convention such as `local:<user>-<label>` or `local:<host>-<label>`.
>
> **Known limitation — ingested identifiers are global server state.** There is no per-principal namespacing in this iteration, so any authenticated caller can overwrite any ingested identifier (a `local:<label>` or an ingested git URL) by uploading to the same identifier. Treat the endpoint as trusted-caller-only.

### `POST /api/v1/prompts/sources`

Uploads (ingests) a skill source as a JSON manifest with base64-encoded file bodies. The server decodes, hardens, and caches it in memory keyed by the `source` identifier, then echoes back the (scrubbed) identifier and a status.

**Request body**:

| Field | Type | Description |
|-------|------|-------------|
| `source` | string (required) | Stable identifier the cached source is keyed by — a git URL (for `--repo-fetch`) or `local:<label>` (for `--repo-dir`). |
| `contentHash` | string (optional) | CLI-computed hash of the manifest. When an identical hash is already cached for this identifier, the upload is short-circuited as `unchanged` (see below). |
| `files` | array (required, non-empty) | The uploaded files. Each entry is `{ "path": "<relative>", "content": "<base64>", "mode": "<octal>" }`. `mode` is optional. |

> **Real request/response, captured against a running server.** The `Authorization` token is redacted to `<token>` (never paste a real credential into docs); everything else — the base64 body, the `contentHash`, and the response — is verbatim. The `content` field is the base64 of the skill's `SKILL.md`; the `contentHash` is the CLI-computed `sha256` of the same manifest. The host is shown as `localhost:3456` to match the other examples on this page.

```bash
curl -s -X POST "http://localhost:3456/api/v1/prompts/sources" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "source": "local:team-dev",
    "contentHash": "sha256:f5b51e0f406fd1a380966ae9a5a47167c98eb38f45b116fce2ae96d720f58e5b",
    "files": [
      { "path": "deploy-app/SKILL.md", "content": "LS0tCm5hbWU6IGRlcGxveS1hcHAKZGVzY3JpcHRpb246IERlcGxveSBhbiBhcHBsaWNhdGlvbiB0byB0aGUgc3BlY2lmaWVkIGVudmlyb25tZW50CmFyZ3VtZW50czoKICAtIG5hbWU6IGVudmlyb25tZW50CiAgICBkZXNjcmlwdGlvbjogVGFyZ2V0IGVudmlyb25tZW50IChzdWJzdGl0dXRlZCBhdCByZW5kZXIgdGltZSkKICAgIHJlcXVpcmVkOiB0cnVlCi0tLQoKIyBkZXBsb3ktYXBwCgpEZXBsb3kgdGhlIGFwcGxpY2F0aW9uIHRvIHt7ZW52aXJvbm1lbnR9fS4gUHJvdmlzaW9uIHRoZSBuYW1lc3BhY2UsIGFwcGx5IHRoZSBtYW5pZmVzdHMsIGFuZCB2ZXJpZnkgdGhlIHJvbGxvdXQuCg==", "mode": "0644" }
    ]
  }'
```

A successful ingest returns the scrubbed `source`, the echoed `contentHash` (if one was sent), the number of files cached, and `status: "ingested"`:

```json
{
    "success": true,
    "data": {
        "source": "local:team-dev",
        "contentHash": "sha256:f5b51e0f406fd1a380966ae9a5a47167c98eb38f45b116fce2ae96d720f58e5b",
        "fileCount": 1,
        "status": "ingested"
    },
    "meta": {
        "timestamp": "2026-06-16T23:29:11.284Z",
        "requestId": "rest_1781652551282_3",
        "version": "v1"
    }
}
```

**Content-hash dedup** — re-uploading the **same** `source` + `contentHash` is recognized as unchanged and short-circuited: nothing is re-decoded or rewritten, and the response carries `status: "unchanged"`:

```json
{
    "success": true,
    "data": {
        "source": "local:team-dev",
        "contentHash": "sha256:f5b51e0f406fd1a380966ae9a5a47167c98eb38f45b116fce2ae96d720f58e5b",
        "fileCount": 1,
        "status": "unchanged"
    },
    "meta": {
        "timestamp": "2026-06-16T23:29:21.128Z",
        "requestId": "rest_1781652561128_5",
        "version": "v1"
    }
}
```

A **different** `contentHash` for the same identifier (or an upload with no hash) is re-ingested normally and returns `status: "ingested"`.

### Rendering an ingested source (`?source=`)

Once a source is ingested, render any skill it contains with `POST /api/v1/prompts/:promptName?source=<identifier>` — **full argument substitution**, identical to a `?repo=` render, but served from the upload with **no clone**. The `?source=` signal takes precedence over `?repo=`, and the server never attempts a git operation for an ingested identifier (so a `--repo-fetch` URL the server cannot reach still renders).

> **Real request/response, captured against a running server** (token redacted to `<token>`). Render the uploaded `deploy-app` skill, substituting its `environment` argument — served from the upload above with no clone.

```bash
curl -s -X POST "http://localhost:3456/api/v1/prompts/deploy-app?source=local%3Ateam-dev" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"arguments":{"environment":"prod"}}'
```

```json
{
    "success": true,
    "data": {
        "description": "Deploy an application to the specified environment",
        "messages": [
            {
                "role": "user",
                "content": {
                    "type": "text",
                    "text": "# deploy-app\n\nDeploy the application to prod. Provision the namespace, apply the manifests, and verify the rollout."
                }
            }
        ],
        "source": "local:team-dev"
    },
    "meta": {
        "timestamp": "2026-06-16T23:29:21.106Z",
        "requestId": "rest_1781652561104_4",
        "version": "v1"
    }
}
```

The `{{environment}}` placeholder in the uploaded `SKILL.md` was substituted with `prod` by the server-side renderer, and `source` echoes the (scrubbed) identifier the entry was served from. The identifier is URL-encoded in the query string (e.g. `?source=local%3Ateam-dev`). The response shape is identical to a normal render — the only difference is where the source came from.

### Limits and errors

The upload endpoint is an untrusted-input surface, so the manifest is hardened **before anything is cached** — a rejected upload is never partially stored:

| Limit / check | Behavior on violation |
|---------------|-----------------------|
| **Max 512 KiB raw request body** — the outer DoS guard, checked **before** the JSON is parsed | `HTTP 413` `PAYLOAD_TOO_LARGE` (`"Request body exceeds 524288 bytes"`) |
| **Max 100 files** per manifest | `HTTP 400` `VALIDATION_ERROR` |
| **Max 256 KiB** total decoded payload (summed across files) | `HTTP 400` `VALIDATION_ERROR` |
| **Path traversal / zip-slip** — any `path` that is absolute or contains `..` | `HTTP 400` `VALIDATION_ERROR` (rejected before any write) |
| **Null byte in a file `path`** | `HTTP 400` `VALIDATION_ERROR` (`"Invalid file path \"…\": contains null byte"`, rejected before any write) |
| **File `mode` bits** | Sanitized: setuid/setgid/sticky stripped, masked to the standard `0777` permission bits; an unparseable mode falls back to `0644`. |

> The two size caps work together: the **512 KiB raw-body cap** is the outer DoS guard, rejected with `413` before the JSON is even parsed; the **256 KiB decoded cap** is the inner application limit on the summed file bodies, rejected with `400` after decode. Base64 inflates a payload by ~33%, so a manifest at the 256 KiB decoded limit travels as ~341 KiB on the wire — comfortably inside the 512 KiB raw cap, which therefore only trips on genuinely oversized requests.

**Render-miss** — rendering a `?source=` identifier with no cached entry (never uploaded, evicted, or not yet re-uploaded since a restart) returns a clear `HTTP 400` instructing the caller to (re)upload. It does **not** fall back to cloning, and the message carries no git/clone vocabulary:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Ingested source not found: local:team-dev. (Re)upload it via POST /api/v1/prompts/sources before rendering."
  }
}
```

> **The ingested cache is in-memory** — populated by the CLI's upload, not fetched by the server, so there is no background refresh (nothing to pull). A fresh deployment and a restart are the same empty-cache state: neither has any ingested source pre-loaded, and the next CLI hook fire (re)uploads and renders normally. A restart is a transient loss of previously-ingested sources until that next upload — part of the normal upload-driven lifecycle, not a failure mode. Re-upload after a restart or eviction (typically on the next hook fire) and the source renders again.

### Secret hygiene

A credential-bearing git-URL identifier is **scrubbed everywhere** it surfaces — the echoed `source`, error messages, and logs. Userinfo credentials and credential-looking query parameters are redacted deterministically: `https://user:tok@gitlab.corp.internal/team/skills.git` becomes `https://***:***@gitlab.corp.internal/team/skills.git`. The same credentialed input always scrubs to the same `source`, so it stays usable as a stable key. The render path resolves the ingested entry by the verbatim identifier (so a credentialed URL still renders), but never echoes the credential.

### Backward compatibility

This endpoint is **purely additive**:

- Deployments and callers that never upload see **zero change**. No new **required** configuration.
- A plain `?repo=<url>` request (no `?source=`) behaves **exactly as before** — clone + render, byte-identical to the previous release. `?source=` is the **only** signal that selects an ingested source; the env-var and `?repo=` clone paths are untouched.
- The companion CLI support (`--repo-fetch` / `--repo-dir` + source upload) ships in the same release; neither half is usable alone.

### Validation Rules for `repo`, `path`, and `branch`

The server validates the `repo`, `path`, and `branch` inputs before performing any clone or pull. Invalid values return HTTP 400 with the standard error envelope. Validation runs **before** the loader is touched, so a rejected override can never corrupt the env-var-configured cache.

| Rule | Behavior |
|------|----------|
| Scheme must be `http` or `https` | Other schemes (`file://`, `ssh://`, `git://`) are rejected: `Invalid override repoUrl scheme: ssh: (only http and https are allowed) for ssh://bad`. |
| `path` must be a safe relative path | `..` segments, absolute paths, and null bytes are rejected (`Invalid override subPath: Relative path cannot escape target directory`, `Invalid override subPath: Relative path cannot be absolute`, `Invalid override subPath: contains null byte`). |
| `branch` must match the git-safe character set | Only `[A-Za-z0-9_.\-/]` is allowed; other characters are rejected: `Invalid override branch name: <branch>`. |
| Credentials in the URL | Never echoed in error messages — scrubbed via `sanitizeUrlForLogging`. |
| `X-Dot-AI-Git-Token` | Never echoed in error messages, logs, the `source` field, or the cache key. A bad/unauthorized token surfaces as a request-scoped clone error, with the token scrubbed. |

**Validation-error envelope** (`HTTP 400`):

```bash
curl -s "http://localhost:3456/api/v1/prompts?repo=ssh://bad" \
  -w "\nHTTP: %{http_code}\n"
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid override repoUrl scheme: ssh: (only http and https are allowed) for ssh://bad"
  },
  "meta": {
    "timestamp": "2026-05-26T19:52:37.389Z",
    "requestId": "rest_1779825157389_10",
    "version": "v1"
  }
}
HTTP: 400
```

An invalid `path` (or `branch`) fails the same way — a request-scoped `HTTP 400` with the deterministic `VALIDATION_ERROR` message from the table above and the same `meta` envelope shape:

```bash
curl -s "http://localhost:3456/api/v1/prompts?repo=https://github.com/org/skills&path=../etc" \
  -w "\nHTTP: %{http_code}\n"
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid override subPath: Relative path cannot escape target directory"
  }
}
HTTP: 400
```

A request that fails validation never touches the loader, so the env-var-configured cache cannot be corrupted by a malformed override.

### Server-side caveats for this release

The `repo` parameter is the server's contract surface for composing prompts from multiple repositories. Each request still serves exactly one repo; how (and whether) callers compose responses from multiple requests is the caller's concern — see the [DevOps AI Toolkit CLI docs](https://devopstoolkit.ai/docs/cli) for the CLI-side composition flow.

- **Per-request credentials**: Each request may carry its own `X-Dot-AI-Git-Token`, so repos on different providers (e.g., GitHub + private GitLab) can each authenticate with their own token. The header takes precedence over `DOT_AI_GIT_TOKEN` for that request only; absent the header, the server env credential is used as before. (This lifts the single-shared-token limitation from the previous release.)
- **Single-slot cache**: The loader caches one repo at a time. Sequential requests against different repos re-clone each time (acceptable cost with `--depth 1` clones, but observable when alternating between repos within the TTL window). Token-bearing override requests are additionally isolated from the shared unauthenticated cache slot, so an authenticated private clone is never served to a different caller.
- **No URL allowlist / SSRF gate**: The endpoint assumes the caller is trusted. Don't expose the override surface to untrusted clients without an upstream gate.

For the user-facing summary, see [Shared Prompt Library § Multi-source skills](../tools/prompts.md#multi-source-skills-via-the-per-request-repo-override).

## Workflows and Use Cases

The REST API provides the same workflows as MCP and CLI. The only difference is using HTTP POST requests.

**For complete workflow patterns and use cases, see the tool-specific guides:**
- **Deployment Workflows**: [Kubernetes Deployment Recommendations](../tools/recommend.md)
- **Troubleshooting Workflows**: [AI-Powered Issue Remediation](../tools/remediate.md)
- **Capability Management**: [Capability Management Guide](../tools/capability-management.md)
- **Pattern Management**: [Pattern Management Guide](../organizational-data/patterns.md)

**Example: REST API call**
```bash
# REST API:
curl -X POST http://your-ingress-url/api/v1/tools/recommend \
  -H "Content-Type: application/json" \
  -d '{"intent": "deploy PostgreSQL database"}'
```

The business logic, parameters, responses, and multi-step workflows are identical across all access methods.
