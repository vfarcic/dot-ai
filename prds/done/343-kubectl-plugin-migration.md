# PRD #343: kubectl Plugin Migration

**GitHub Issue**: [#343](https://github.com/vfarcic/dot-ai/issues/343)
**Parent PRD**: [#342 - Modular Plugin Architecture](./342-modular-plugin-architecture.md)
**Status**: Complete
**Priority**: High
**Created**: 2025-01-25

---

## Problem Statement

kubectl tools (`kubectl_get`, `kubectl_apply`, etc.) are embedded in dot-ai core (`src/core/kubectl-tools.ts`), preventing:
1. Modular extension by users
2. Clear separation of concerns
3. Independent testing and development of tools

Additionally, Kubernetes interactions are scattered across the codebase:
- `src/core/kubectl-tools.ts` - agentic kubectl tools
- `src/core/discovery.ts` - `KubernetesDiscovery` class with `executeKubectl()`
- `src/tools/version.ts` - direct `@kubernetes/client-node` usage for K8s version
- Various files using `KubernetesDiscovery` or direct K8s client

This duplication leads to inconsistent error handling, harder testing, and maintenance burden.

---

## Solution Overview

1. Create `agentic-tools` package in monorepo (`packages/agentic-tools/`)
2. Implement kubectl_* tools with standard plugin interface
3. Build as container image with HTTP endpoint
4. Integrate into dot-ai (plugin discovery and invocation)
5. Remove old kubectl-tools code from dot-ai core

**Done when**: ALL Kubernetes interactions go through the plugin system and scattered K8s code is removed.

---

## Technical Design

### Plugin Interface

**Endpoint**: `POST /execute`

**Describe Hook** (returns tool definitions):
```json
// Request
{
  "hook": "describe"
}

// Response
{
  "name": "agentic-tools",
  "version": "1.0.0",
  "tools": [
    {
      "name": "kubectl_get",
      "type": "agentic",
      "description": "Get Kubernetes resources",
      "inputSchema": {
        "type": "object",
        "properties": {
          "kind": { "type": "string", "description": "Resource kind" },
          "namespace": { "type": "string", "description": "Namespace" },
          "name": { "type": "string", "description": "Resource name" },
          "output": { "type": "string", "default": "json" }
        },
        "required": ["kind"]
      }
    }
    // ... other tools
  ]
}
```

**Invoke Hook** (executes tool):
```json
// Request
{
  "hook": "invoke",
  "sessionId": "ses_abc123",
  "payload": {
    "tool": "kubectl_get",
    "args": {
      "kind": "Pod",
      "namespace": "default"
    },
    "state": {}
  }
}

// Response
{
  "sessionId": "ses_abc123",
  "success": true,
  "result": {
    "items": [...]
  },
  "state": {
    "lastQuery": "pods"
  }
}
```

**Error Response**:
```json
{
  "sessionId": "ses_abc123",
  "success": false,
  "error": {
    "code": "KUBECTL_FAILED",
    "message": "Failed to get pods: connection refused",
    "details": {}
  }
}
```

### Package Structure

```
packages/agentic-tools/
├── Dockerfile
├── .dockerignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts          # HTTP server, /execute endpoint
│   ├── types.ts          # Shared types for HTTP interface
│   ├── hooks/
│   │   ├── describe.ts   # Returns tool definitions
│   │   └── invoke.ts     # Routes to tool handlers
│   └── tools/
│       ├── index.ts      # Tool registry
│       ├── kubectl-get.ts
│       ├── kubectl-apply.ts
│       ├── kubectl-describe.ts
│       ├── kubectl-logs.ts
│       ├── kubectl-events.ts
│       ├── kubectl-api-resources.ts
│       └── kubectl-get-crd-schema.ts
└── tests/
    └── unit/             # Fast tests, no cluster needed
```

### dot-ai Integration

**Helm Configuration** (`values.yaml`):

Plugins are configured as a map, allowing users to customize defaults or add their own.
Built-in plugins use `dot-ai-` prefix.

```yaml
# Plugin configuration (PRD #343)
# Two modes:
#   - Deployed: Provide `image` + `port` → chart creates Deployment + Service
#   - External: Provide `endpoint` → chart just registers it (you deploy separately)
plugins:
  # Built-in plugin - deployed by chart
  dot-ai-agentic-tools:
    enabled: true
    image:
      repository: ghcr.io/vfarcic/dot-ai-agentic-tools
      tag: "0.1.0"
    port: 8080
    # RBAC created automatically by chart (hardcoded for agentic-tools)
    env: []                    # Additional environment variables
    envFrom: []                # Environment from ConfigMaps/Secrets
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
      limits:
        memory: "512Mi"
        cpu: "500m"

  # Example: User plugin deployed by chart
  # my-company-tools:
  #   enabled: true
  #   image:
  #     repository: myregistry/my-tools
  #     tag: "v1.0.0"
  #   port: 8082
  #   serviceAccountName: "my-tools-sa"  # You create this SA with needed permissions
  #   env:
  #     - name: API_KEY
  #       valueFrom:
  #         secretKeyRef:
  #           name: my-tools-secrets
  #           key: api-key

  # Example: External plugin (you deploy separately)
  # my-external-plugin:
  #   enabled: true
  #   endpoint: "http://my-plugin.other-namespace.svc:8080"
  #   # NOTE: You are responsible for deploying this plugin and
  #   # ensuring it has appropriate Kubernetes RBAC permissions.
```

**Deployment Model**: Separate Deployments (not sidecars).
- Each plugin runs as its own Deployment + Service
- Independent scaling and lifecycle
- Plugin updates don't restart MCP server
- Standard K8s service discovery via DNS
- `DOT_AI_PLUGINS_CONFIG` env var auto-built from enabled plugins

**Plugin Configuration Modes**:
- **Deployed by chart**: Provide `image` + `port` → chart creates Deployment + Service, auto-generates endpoint
- **External (user-managed)**: Provide `endpoint` only → chart just registers it, user deploys separately

```yaml
plugins:
  # Deployed by chart (has image + port)
  dot-ai-agentic-tools:
    enabled: true
    image:
      repository: ghcr.io/vfarcic/dot-ai-agentic-tools
      tag: "0.1.0"
    port: 8080
    env: []           # Additional environment variables
    envFrom: []       # Environment from ConfigMaps/Secrets
    resources: ...
    # endpoint auto-computed: http://<release>-dot-ai-agentic-tools:8080

  # External plugin (user deploys separately)
  # my-external-plugin:
  #   enabled: true
  #   endpoint: "http://my-plugin.other-namespace.svc:8080"
  #   serviceAccountName: "my-existing-sa"  # Optional, user creates this
```

**RBAC Strategy**:
- MCP server no longer needs Kubernetes permissions (all K8s ops go through plugins)
- Only `agentic-tools` plugin needs K8s RBAC (runs kubectl commands)
- Chart creates ServiceAccount + ClusterRole + ClusterRoleBinding specifically for `agentic-tools` (hardcoded in template)
- User plugins requiring K8s access specify `serviceAccountName` pointing to their own SA
- Removing RBAC from MCP server validates migration completeness (if something breaks, we missed migrating code)

**Discovery Flow**:
1. dot-ai starts, reads plugin configuration from `DOT_AI_PLUGINS_CONFIG` env var
2. Plugin Deployments run as separate pods with their own Services
3. dot-ai waits for plugin readiness (health/ready endpoints)
4. dot-ai calls `POST /execute {hook: "describe"}` on each plugin via Service DNS
5. dot-ai registers tools from responses
6. Tools available for both agentic loops AND direct code invocation

**Invocation Flow** (two paths):
1. **Agentic** (AI-driven): LLM → toolLoop → `PluginManager.createToolExecutor()` → plugin HTTP
2. **Direct** (code-driven): Code → `PluginManager.invokeTool()` → plugin HTTP

---

## Scope

### In Scope

- Create `packages/agentic-tools/` package structure
- Implement HTTP server with `/execute` endpoint
- Implement `describe` hook returning tool definitions
- Implement `invoke` hook with routing to tools
- Migrate all kubectl_* agentic tools:
  - kubectl_get
  - kubectl_apply
  - kubectl_describe
  - kubectl_logs
  - kubectl_events
  - kubectl_api_resources
  - kubectl_get_crd_schema
- Add utility kubectl tools for non-agentic use:
  - kubectl_version (for `version` tool to get K8s version)
  - Other utility operations as discovered
- Create Dockerfile for container image
- Integrate plugin discovery into dot-ai
- Integrate plugin invocation into dot-ai (both agentic loops AND direct calls)
- Consolidate ALL Kubernetes interactions to use plugin:
  - Update `version.ts` to use plugin for K8s version instead of `KubernetesDiscovery`
  - Update other files using `KubernetesDiscovery.executeKubectl()` to use plugin
  - Remove direct `@kubernetes/client-node` usage where plugin tools suffice
- Remove old `src/core/kubectl-tools.ts`
- Deprecate/remove `KubernetesDiscovery.executeKubectl()` (keep only config/connection logic)
- Update Helm chart for plugin deployment
- Integration tests

### Out of Scope

- Other agentic tools (search_*, mermaid) - future PRDs
- MCP tools as plugins - future PRDs
- User-provided plugin documentation - future PRDs

### K8s Interaction Consolidation Map

Files currently using Kubernetes interactions that need migration to plugin:

| File | Current Approach | Migration Action |
|------|------------------|------------------|
| `src/core/kubectl-tools.ts` | Direct kubectl execution | Remove entirely (M7) |
| `src/core/discovery.ts` | `executeKubectl()` method | Remove method, keep connection/config logic |
| `src/tools/version.ts` | `KubernetesDiscovery` + `@kubernetes/client-node` | Use `kubectl_version` plugin tool |
| `src/tools/query.ts` | `executeKubectlTools` | Use plugin executor |
| `src/tools/remediate.ts` | `executeKubectlTools` | Use plugin executor |
| `src/tools/operate-analysis.ts` | `executeKubectlTools` | Use plugin executor |
| `src/core/capability-scan-workflow.ts` | `KubernetesDiscovery` | Evaluate; may need plugin tools |
| `src/core/policy-operations.ts` | `KubernetesDiscovery` | Evaluate; may need plugin tools |
| `src/core/deploy-operation.ts` | `KubernetesDiscovery` | Evaluate; may need plugin tools |

**Note**: Some files may legitimately need `@kubernetes/client-node` for watch streams or complex operations. Evaluate case-by-case during M5.

---

## Milestones

- [x] **M1: Package structure and HTTP server**
  - Create `packages/agentic-tools/` with basic structure
  - Implement HTTP server with `/execute` endpoint
  - Implement `describe` hook (empty tools list initially)
  - Dockerfile builds and runs

- [x] **M2: kubectl tools implementation**
  - Migrate all kubectl_* tools to new package
  - Implement `invoke` hook with routing
  - Tools work when called directly via HTTP

- [x] **M3: dot-ai plugin discovery**
  - dot-ai reads plugin configuration
  - dot-ai calls `describe` on plugins at startup
  - dot-ai registers tools from plugin responses

- [x] **M4a: Helm chart plugin deployment**
  - Update `values.yaml` with `plugins` map configuration (image+port OR endpoint)
  - Create `templates/plugin-deployment.yaml` for plugin Deployments + Services
  - Create `templates/plugin-configmap.yaml` for plugins.json (mounted at `/etc/dot-ai/`)
  - Add `dot-ai.pluginsConfig` helper to `_helpers.tpl` for building plugins JSON
  - Update `deployment.yaml` to mount ConfigMap and remove `serviceAccountName`
  - Plugin uses existing ServiceAccount (RBAC shared, removed from MCP server)
  - Update `PluginManager.parsePluginConfig()` to read from file instead of env var
  - Integration test: Verify plugin Deployment, Service, and ConfigMap created
  - **Done when**: Plugin deploys as separate Deployment, `/health` and `/ready` respond, MCP server connects via Service

- [x] **M4b: `version` tool plugin integration** (prove direct invocation)
  - Add `kubectl_version` tool to agentic-tools plugin
  - `version.ts` calls plugin via `PluginManager.invokeTool()` for K8s version
  - Add registered agentic tools list to `version` output
  - **Testing strategy**:
    - Existing tests validate K8s version still returned (no regression)
    - New test validates registered tools list is included
  - **Done when**: `version` MCP tool returns K8s version from plugin + lists discovered tools

- [x] **M5: `query` tool + REST API plugin integration** (prove agentic invocation)
  - Add `createToolExecutor()` to PluginManager for agentic loop routing
  - `query.ts` uses plugin executor in its toolLoop
  - Remove direct `executeKubectlTools` import from `query.ts`
  - Migrate REST API endpoints to use plugin (no fallback):
    - `GET /api/v1/resource` → uses `kubectl_get_resource_json` via plugin
    - `GET /api/v1/logs` → uses `kubectl_logs` via plugin
    - `GET /api/v1/events` → uses `kubectl_events` via plugin
    - `GET /api/v1/resources?includeStatus=true` → fetches status via plugin
  - Remove direct kubectl imports from `rest-api.ts`
  - **Testing strategy**:
    - Existing `query.test.ts` tests cover kubectl tool usage (kubectl_get, semantic bridge pattern)
    - Since MCP server passes `pluginManager` to query tool, existing tests implicitly validate plugin routing
    - Existing REST API tests validate endpoint functionality through plugin
  - **Done when**: `query` tool and REST API endpoints work end-to-end through plugin, existing tests pass

- [x] **M6: Remaining agentic consumers**
  - Migrate `remediate.ts` to use plugin executor
  - Migrate `operate-analysis.ts` to use plugin executor
  - Audit and migrate other `KubernetesDiscovery.executeKubectl()` usages
  - Fixed Helm 4 dry-run behavior (`--dry-run=client`)
  - Fixed plugin client timeout (30s → 5m for Helm operations)

- [x] **M7: Cleanup**
  - Remove old `src/core/kubectl-tools.ts`
  - Remove `src/core/kubernetes-utils.ts` (standalone executeKubectl)
  - Remove unused functions from `resource-tools.ts` (`fetchResource`, `getPodLogs`, `getResourceEvents`)
  - Note: `KubernetesDiscovery.executeKubectl()` kept as internal method - already migrated to use plugin in M5/M6

- [x] **M8: CI/CD updates**
  - Restructured release.yml into parallel jobs: `prepare`, `build-dot-ai`, `build-agentic-tools`, `finalize`
  - `build-dot-ai` and `build-agentic-tools` jobs run in parallel after `prepare`
  - Both images use same version tags and are published to ghcr.io
  - Helm chart values.yaml updated during release to sync both image tags
  - GitHub release notes include both Docker images
  - **Done when**: CI builds plugin image, release publishes both images

---

## Dependencies

### Internal
- dot-ai core (MCP server, agentic loop engine)
- Helm chart

### External
- Kubernetes cluster for testing
- Container registry (ghcr.io)

---

## Success Criteria

1. **Plugin works standalone**: Can call `/execute` directly and get correct responses
2. **Integration works**: MCP tool calls flow through plugin correctly
3. **No regression**: Existing functionality works as before
4. **Old code removed**: `kubectl-tools.ts` deleted, no dead code
5. **K8s consolidated**: ALL Kubernetes interactions go through plugin (no scattered K8s code)
6. **Version tool enhanced**: Reports agentic tools count and uses plugin for K8s version
7. **Tests pass**: Integration tests cover the new flow
8. **Deployable**: Helm chart deploys plugin alongside dot-ai

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Latency from HTTP calls | Benchmark; optimize if needed; keep containers warm |
| Plugin startup timing | Implement readiness probes and retry logic in dot-ai |
| Breaking existing flows | Comprehensive integration tests before removing old code |
| Kubernetes auth in plugin | Pass kubeconfig via mount or environment |
| Plugin unavailable blocks all K8s ops | Implement health checks; graceful degradation; clear error messages |
| Scope creep from consolidation | Document exact files/methods to migrate; stick to list |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-25 | Single `agentic-tools` package | All agentic tools in one container; simpler deployment |
| 2025-01-25 | Two hooks: describe + invoke | Minimal surface to start; expand when needed |
| 2025-01-25 | HTTP interface | Language-agnostic, standard, easy to test |
| 2025-01-25 | Monorepo package | Can split later; easier to develop together initially |
| 2026-01-26 | Self-contained tool modules with `KubectlTool` interface | Combines definition+handler; eliminates switch statement; enables isolated testing |
| 2026-01-26 | ALL K8s interactions must go through plugin | Eliminates scattered K8s code (`KubernetesDiscovery.executeKubectl()`, direct `@kubernetes/client-node`); single source of truth for K8s operations; consistent error handling; easier testing |
| 2026-01-26 | Incremental integration: `version` first, then `query`, then others | Proves direct invocation (version) before agentic invocation (query); each step validates the pattern before expanding; reduces risk |
| 2026-01-26 | Sidecar deployment model | Simple networking (localhost), same lifecycle as MCP server, no service discovery needed |
| 2026-01-26 | Plugins as map in values.yaml (not array) | Helm maps merge on override; users can selectively disable or add plugins without redefining all defaults |
| 2026-01-26 | `dot-ai-` prefix for built-in plugins | Clear distinction between official and user-provided plugins in `helm get values` output |
| 2026-01-26 | Separate M4a (Helm/infra) from M4b (code integration) | Validate infrastructure works before debugging application logic; catch deployment issues early |
| 2026-01-26 | Separate Deployments instead of sidecars | Independent scaling, independent lifecycle (plugin updates don't restart MCP), cleaner separation of concerns, plugin failure doesn't crash MCP pod; networking via K8s Service DNS is standard pattern |
| 2026-01-26 | Plugin config: `image`+`port` OR `endpoint` (mutually exclusive) | Implicit deploy vs external mode; no redundant `deploy: true/false` flag; validation is simple - presence of `image` implies chart deploys it |
| 2026-01-26 | Generic plugin config with `env`, `envFrom`, `serviceAccountName` | Future-proof; plugins may need API keys via env vars or secrets; follows standard K8s container patterns |
| 2026-01-26 | RBAC hardcoded for `agentic-tools` only, not generic | Only agentic-tools needs K8s RBAC (kubectl commands); chart shouldn't create arbitrary ClusterRoles for user plugins (security concern); users handle their own RBAC |
| 2026-01-26 | Remove RBAC from MCP server | MCP server no longer needs K8s permissions after full migration; serves as validation - if something breaks, we know we missed migrating code to plugins |
| 2026-01-26 | Plugin config via ConfigMap file, not env var | Cleaner K8s-native approach; ConfigMap mounted at `/etc/dot-ai/plugins.json`; no env var fallback since plugins only work in-cluster anyway |
| 2026-01-26 | Plugin reuses existing ServiceAccount | No separate RBAC for plugin; agentic-tools uses dot-ai ServiceAccount; simpler than duplicating RBAC rules |
| 2026-01-26 | Plugin name `agentic-tools` (not `dot-ai-agentic-tools`) | Avoids duplicate prefix in resource names (`dot-ai-dot-ai-agentic-tools`); deployment becomes `dot-ai-agentic-tools` |
| 2026-01-26 | REST API endpoints must use plugin for kubectl ops | MCP server has no RBAC; REST endpoints (`/api/v1/resource`, `/logs`, `/events`) were failing; expanded M5 scope to include REST API migration |
| 2026-01-26 | No fallback to direct kubectl execution | MCP server intentionally has no RBAC; fallback would never work; cleaner to fail with "plugin unavailable" error than silent failure |
| 2026-01-26 | Add M8 for CI/CD updates | Need workflow to build/publish `dot-ai-agentic-tools` image; release workflow must publish both images |

---

## On Completion

**When this PRD is complete, update the umbrella PRD [#342](./342-modular-plugin-architecture.md):**

1. **Migration Tracking table**: Mark kubectl_* tools as "Complete" with link to this PRD
2. **Lessons Learned section**: Document what worked, what didn't, and recommendations for future tool migrations
3. **Child PRDs section**: Mark this PRD as complete
