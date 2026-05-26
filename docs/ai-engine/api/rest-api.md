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

See the [Shared Prompt Library](../tools/prompts.md) for the user-facing tool guide.

### Endpoint Summary

| Endpoint | `repo` parameter |
|----------|------------------|
| `POST /api/v1/prompts/refresh` | JSON body: `{ "repo": "<url>" }` |
| `GET /api/v1/prompts` | Query string: `?repo=<url>` |
| `POST /api/v1/prompts/:promptName` | Query string: `?repo=<url>` |

### The `source` field

Every response from these endpoints includes a `source` field identifying which repository the prompts came from.

`source` values:

| Request | `source` value |
|---------|----------------|
| `repo` parameter supplied | The supplied URL (credentials scrubbed) |
| `repo` omitted, `DOT_AI_USER_PROMPTS_REPO` set | The env-var URL (credentials scrubbed) |
| `repo` omitted, no env-var repo | `"built-in"` |

**Credential scrubbing**: URLs with embedded credentials are scrubbed before being echoed back. `https://user:tok@host/repo` becomes `https://***:***@host/repo`. The transform is deterministic, so the same credentialed URL always produces the same `source` value across requests.

### `POST /api/v1/prompts/refresh`

Force-refreshes the prompts cache. Use this when you've pushed new prompts to the repository and don't want to wait for `DOT_AI_USER_PROMPTS_CACHE_TTL` to expire.

**Request body** (all fields optional):

| Field | Type | Description |
|-------|------|-------------|
| `repo` | string | Override repository URL (HTTPS). When supplied, bypasses `DOT_AI_USER_PROMPTS_REPO` for this request. |

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

### `GET /api/v1/prompts`

Lists all available prompts (built-in plus user-defined). Returns the prompt names, descriptions, and any declared arguments.

**Query parameters** (all optional):

| Parameter | Description |
|-----------|-------------|
| `repo` | Override repository URL (HTTPS). When supplied, bypasses `DOT_AI_USER_PROMPTS_REPO` for this request. |

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

### `POST /api/v1/prompts/:promptName`

Returns the rendered content (`messages`, optional `files`) of a single prompt by name.

**Query parameters** (all optional):

| Parameter | Description |
|-----------|-------------|
| `repo` | Override repository URL (HTTPS). When supplied, bypasses `DOT_AI_USER_PROMPTS_REPO` for this request. |

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

### Validation Rules for `repo`

The server validates the `repo` parameter before performing any clone or pull. Invalid values return HTTP 400 with the standard error envelope.

| Rule | Behavior |
|------|----------|
| Scheme must be `http` or `https` | Other schemes (`file://`, `ssh://`, `git://`) are rejected. |
| `subPath` must be a safe relative path | `..` segments, absolute paths, and null bytes are rejected. (subPath is not exposed via REST in this release — the env-var defaults apply.) |
| `branch` must match the git-safe character set | Validated when supplied programmatically. (Not exposed via REST in this release.) |
| Credentials in the URL | Never echoed in error messages — scrubbed via `sanitizeUrlForLogging`. |

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

A request that fails validation never touches the loader, so the env-var-configured cache cannot be corrupted by a malformed override.

### Server-side caveats for this release

The `repo` parameter is the server's contract surface for composing prompts from multiple repositories. Each request still serves exactly one repo; how (and whether) callers compose responses from multiple requests is the caller's concern — see the [DevOps AI Toolkit CLI docs](https://devopstoolkit.ai/docs/cli) for the CLI-side composition flow.

- **Single shared token**: All overrides authenticate with the same `DOT_AI_GIT_TOKEN`. Repos that live on different providers (e.g., GitHub + private GitLab) can't both be authenticated. Per-repo tokens are deferred.
- **Single-slot cache**: The loader caches one repo at a time. Sequential requests against different repos re-clone each time (acceptable cost with `--depth 1` clones, but observable when alternating between repos within the TTL window).
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
