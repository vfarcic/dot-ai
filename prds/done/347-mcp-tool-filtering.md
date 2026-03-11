# PRD #347: MCP Tool Filtering

## Problem Statement

Users connecting to the dot-ai MCP server receive all available tools in the `tools/list` response, regardless of whether they need them. This has several implications:

1. **Context bloat**: Each tool definition consumes tokens in the AI client's context window
2. **No admin control**: Cluster administrators cannot restrict which tools are available to users
3. **One-size-fits-all**: All clients get the same tools, even when use cases differ

Since dot-ai runs exclusively in Kubernetes with HTTP transport, we need a server-side configuration mechanism that allows administrators to control tool visibility.

## Solution Overview

Implement server-side tool filtering using a ConfigMap-based configuration (following the existing plugin configuration pattern). The configuration supports both **allow lists** (only specified tools are exposed) and **deny lists** (specified tools are hidden).

### Configuration Format

```json
{
  "allow": ["query", "recommend", "version"],
  "deny": ["operate", "remediate"]
}
```

**Precedence rules:**
- If `allow` is specified and non-empty, only those tools are exposed (whitelist mode)
- If `deny` is specified, those tools are excluded from the result
- `deny` takes precedence over `allow` (a tool in both lists is denied)
- Empty config or missing file = all tools exposed (current behavior)

### Helm Values Configuration

```yaml
# Tool filtering configuration (PRD #347)
# Controls which MCP tools are exposed to clients
tools:
  # Allowlist: Only expose these tools (empty = all tools allowed)
  allow: []
  # Denylist: Never expose these tools (takes precedence over allow)
  deny: []

# Examples:
#
# Expose only query and recommend tools:
# tools:
#   allow:
#     - query
#     - recommend
#
# Expose all tools except operate:
# tools:
#   deny:
#     - operate
#
# Expose specific tools but never remediate:
# tools:
#   allow:
#     - query
#     - recommend
#     - version
#   deny:
#     - remediate
```

## User Journey

### Before (Current State)
1. User connects to dot-ai MCP server
2. Server returns all 7+ tools in `tools/list`
3. All tool definitions consume context tokens
4. User may only need 2-3 tools but pays token cost for all

### After (With Tool Filtering)
1. Admin configures tool filtering via Helm values
2. ConfigMap is created with filter rules
3. User connects to dot-ai MCP server
4. Server filters tools based on ConfigMap
5. Only allowed tools are returned in `tools/list`
6. Reduced context usage, admin control over capabilities

## Technical Design

### Configuration File Location

Following the plugin configuration pattern:
- **Path**: `/etc/dot-ai/tools.json`
- **Mounted from**: ConfigMap `{{ .Release.Name }}-tools`

### Implementation Components

1. **ToolFilterConfig type** (`src/core/tool-filter.ts`)
   - Parse configuration from file
   - Validate tool names
   - Apply filter logic

2. **MCPServer integration** (`src/interfaces/mcp.ts`)
   - Load filter config at startup
   - Filter tools in `registerTools()` method

3. **Helm chart updates** (`charts/`)
   - New `tools` section in `values.yaml`
   - New `tools-configmap.yaml` template
   - Mount ConfigMap in deployment

### Filter Logic

```typescript
function shouldExposeTools(toolName: string, config: ToolFilterConfig): boolean {
  // Deny takes precedence
  if (config.deny.includes(toolName)) {
    return false;
  }

  // If allow list is specified, tool must be in it
  if (config.allow.length > 0) {
    return config.allow.includes(toolName);
  }

  // Default: expose all tools
  return true;
}
```

## Success Criteria

1. **Functional**: Tools can be filtered via ConfigMap configuration
2. **Backward compatible**: Empty/missing config exposes all tools (current behavior)
3. **Documented**: Helm values documented with examples
4. **Tested**: Integration tests verify filtering behavior
5. **Logged**: Startup logs show which tools are filtered

## Out of Scope

- **Per-client filtering** (X-MCP-Tools header): Not needed for single-tenant deployments
- **Dynamic filtering**: Config is read at startup only (restart required for changes)
- **Tool categories**: Filter by individual tool name only, not by category

## Milestones

- [ ] M1: Core implementation - ToolFilterConfig parser and filter logic
- [ ] M2: MCP server integration - Apply filtering in registerTools()
- [ ] M3: Helm chart updates - ConfigMap, values.yaml, deployment mount
- [ ] M4: Integration tests - Verify filtering behavior
- [ ] M5: Documentation - Update Helm values documentation

## Dependencies

- Existing plugin ConfigMap pattern (PRD #343)
- HTTP transport (Kubernetes deployment)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Misconfigured filter blocks all tools | High | Validate config at startup, log warnings |
| Invalid tool names in config | Low | Log warning for unknown tool names |
| Breaking change if default changes | Medium | Default to all tools exposed (current behavior) |

## Timeline

Medium priority - implement after current PRD #343 work is complete.
