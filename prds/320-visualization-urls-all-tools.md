# PRD #320: Visualization URLs for All MCP Tools

## Overview

| Field | Value |
|-------|-------|
| **PRD ID** | 320 |
| **Feature Name** | Visualization URLs for All MCP Tools |
| **Priority** | High |
| **Status** | In Progress |
| **Created** | 2026-01-02 |
| **Last Updated** | 2026-01-02 |

## Problem Statement

Only the `query` tool returns visualization URLs for the Web UI (PRD #317). Other tools (`recommend`, `remediate`, `operate`, `manageOrgData`, `version`, `projectSetup`) return complex data that would benefit significantly from visual representation but lack Web UI integration.

**Key insight**: Each tool returns fundamentally different data that requires tailored visualization:
- `recommend`: Solutions need comparison cards and resource topology diagrams
- `remediate`: Investigation paths need flowcharts, actions need risk-colored cards
- `operate`: Changes need before/after diffs and change topology
- `manageOrgData`: Capabilities need category-grouped maps
- `version`: System health needs dashboard-style status indicators
- `projectSetup`: Coverage needs gap visualization charts

## Solution

Extend the visualization infrastructure from PRD #317 to all MCP tools by:
1. Adding session storage and `visualizationUrl` generation at appropriate workflow stages
2. Creating tool-specific visualization prompts that understand each tool's data structure
3. Reusing the existing `/api/v1/visualize/{sessionId}` endpoint with tool-aware prompt selection

## Architecture

### Shared Infrastructure (from PRD #317)
- `GET /api/v1/visualize/{sessionId}` endpoint
- `WEB_UI_BASE_URL` environment variable for feature toggle
- Session storage via `GenericSessionManager`
- Visualization types: `mermaid`, `cards`, `code`, `table`

### New Components
- Tool-specific visualization prompts in `prompts/visualize-{tool}.md`
- Session metadata to identify source tool for prompt selection
- New visualization type: `diff` for before/after comparisons

### Session Metadata Extension

Sessions will include tool identification:
```typescript
interface VisualizationSession {
  toolName: string;  // 'query' | 'recommend' | 'remediate' | 'operate' | etc.
  stage?: string;    // For multi-stage tools, which stage produced this data
  data: any;         // Tool-specific data to visualize
  timestamp: string;
}
```

The visualization endpoint will load the appropriate prompt based on `toolName`.

## Tool-by-Tool Visualization Design

### 1. recommend (High Priority)

**Stage**: `recommend` (solution listing)

**Data to Visualize**:
- Solutions array with scores, descriptions, resources, patterns, policies
- Organizational context (pattern/policy counts)

**Visualization Types**:
| Visualization | Type | Purpose |
|---------------|------|---------|
| Solution Comparison | `cards` | Compare solutions side-by-side with scores and tags |
| Resource Topology | `mermaid` | Show what resources each solution would create |
| Pattern/Policy Usage | `table` | Which patterns/policies apply to each solution |

**Prompt**: `prompts/visualize-recommend.md`

---

### 2. remediate (High Priority)

**Stage**: Analysis (after investigation, before execution)

**Data to Visualize**:
- Investigation path (what was checked, what was found)
- Root cause analysis with confidence
- Remediation actions with risk levels

**Visualization Types**:
| Visualization | Type | Purpose |
|---------------|------|---------|
| Investigation Flow | `mermaid` | Flowchart of investigation steps and findings |
| Root Cause | `cards` | Confidence level, contributing factors |
| Remediation Actions | `cards` | Risk-colored cards (green/yellow/red) for each action |

**Prompt**: `prompts/visualize-remediate.md`

---

### 3. operate (High Priority)

**Stage**: Analysis (after dry-run, before execution)

**Data to Visualize**:
- Current state vs proposed changes
- Resources to create/update/delete
- Risk assessment

**Visualization Types**:
| Visualization | Type | Purpose |
|---------------|------|---------|
| Change Summary | `cards` | Create/Update/Delete counts with risk level |
| Change Topology | `mermaid` | Visual diff of what changes |
| Commands | `code` | Commands that will be executed |

**Prompt**: `prompts/visualize-operate.md`

---

### 4. manageOrgData - capabilities list (High Priority)

**Operation**: `list` for capabilities

**Data to Visualize**:
- All discovered cluster capabilities
- CRD groups and categories
- Resource relationships

**Visualization Types**:
| Visualization | Type | Purpose |
|---------------|------|---------|
| Capability Map | `mermaid` | Grouped by category (databases, networking, etc.) |
| Capabilities Table | `table` | Sortable list with kind, group, apiVersion |
| Category Summary | `cards` | Count per category with descriptions |

**Prompt**: `prompts/visualize-capabilities.md`

---

### 5. recommend - generateManifests (Medium Priority)

**Stage**: `generateManifests`

**Data to Visualize**:
- Generated YAML manifests
- Resource relationships
- Validation results

**Visualization Types**:
| Visualization | Type | Purpose |
|---------------|------|---------|
| Resource Topology | `mermaid` | How generated resources relate to each other |
| Manifests | `code` | Syntax-highlighted YAML |
| Validation Status | `cards` | Dry-run results, any warnings |

**Prompt**: `prompts/visualize-manifests.md`

---

### 6. version (Medium Priority)

**Stage**: Single stage (diagnostics)

**Data to Visualize**:
- System component health
- Connection statuses
- Capability summary

**Visualization Types**:
| Visualization | Type | Purpose |
|---------------|------|---------|
| Health Dashboard | `cards` | Status cards for each component (green/yellow/red) |
| Connections | `table` | Component, status, details |
| Capabilities | `cards` | What features are available |

**Prompt**: `prompts/visualize-version.md`

---

### 7. projectSetup - reportScan (Medium Priority)

**Stage**: `reportScan`

**Data to Visualize**:
- Coverage percentage
- Missing files by scope
- Recommended actions

**Visualization Types**:
| Visualization | Type | Purpose |
|---------------|------|---------|
| Coverage Overview | `cards` | Coverage %, found/missing counts |
| Gaps by Scope | `table` | Scope, missing files, description |
| Recommendations | `cards` | Prioritized scopes to address |

**Prompt**: `prompts/visualize-project-setup.md`

---

## Success Criteria

1. All listed tools return `visualizationUrl` when `WEB_UI_BASE_URL` is configured
2. Each tool has a dedicated visualization prompt producing relevant visualizations
3. Visualization endpoint correctly routes to tool-specific prompts
4. Web UI can render visualizations for all tools without changes (uses same types)
5. Integration tests validate visualization generation for each tool
6. No regression in existing query tool visualization

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prompt complexity for multi-stage tools | AI confusion on what to visualize | Clear stage identification in session data |
| Inconsistent visualization quality across tools | Poor UX | Standardize prompt structure, review each output |
| Session storage growth | Memory pressure | Same ephemeral strategy as query tool |
| AI latency on complex visualizations | Slow page load | Accept tradeoff; consider caching |

## Out of Scope

- Interactive visualizations (clicking, filtering)
- Real-time updates during workflow execution
- Custom visualization types beyond mermaid/cards/code/table/diff
- Visualization for workflow intermediate steps (only final/key stages)

## Milestones

### Milestone 1: Infrastructure Updates
- [x] Add `toolName` and `stage` to session metadata
- [x] Update visualization endpoint to select prompt based on toolName
- [x] Add `diff` visualization type support
- [x] Create shared visualization utilities (session creation, URL generation)

### Milestone 2: recommend Tool Visualization
- [ ] Add session storage to recommend stage
- [ ] Create `prompts/visualize-recommend.md`
- [ ] Return `visualizationUrl` in recommend response
- [ ] Integration tests for recommend visualization

### Milestone 3: remediate Tool Visualization
- [ ] Add session storage to remediate analysis stage
- [ ] Create `prompts/visualize-remediate.md`
- [ ] Return `visualizationUrl` in remediate analysis response
- [ ] Integration tests for remediate visualization

### Milestone 4: operate Tool Visualization
- [ ] Add session storage to operate analysis stage
- [ ] Create `prompts/visualize-operate.md`
- [ ] Return `visualizationUrl` in operate analysis response
- [ ] Integration tests for operate visualization

### Milestone 5: manageOrgData Capabilities Visualization
- [ ] Add session storage to capabilities list operation
- [ ] Create `prompts/visualize-capabilities.md`
- [ ] Return `visualizationUrl` in capabilities list response
- [ ] Integration tests for capabilities visualization

### Milestone 6: Medium Priority Tools
- [ ] recommend/generateManifests: session, prompt, URL, tests
- [ ] version: session, prompt, URL, tests
- [ ] projectSetup/reportScan: session, prompt, URL, tests

### Milestone 7: Documentation
- [ ] Update tool documentation with visualization examples
- [ ] Document new visualization types
- [ ] Add visualization screenshots to docs

## Progress Log

| Date | Update |
|------|--------|
| 2026-01-02 | PRD created |
| 2026-01-02 | Milestone 1 complete: Added `diff` type, created `src/core/visualization.ts` with shared utilities, updated visualization endpoint for tool-aware prompt selection, query tool now includes `toolName` in sessions |

## Dependencies

- PRD #317 (Query Tool Visualization) - Complete, provides infrastructure
- Web UI (dot-ai-ui) - Must support existing visualization types

## Related PRDs

- PRD #317: Query Tool Visualization Endpoint (foundation)
- PRD #318: Visualization Feature Documentation
- PRD #109: Web UI for MCP Server Interaction

## Technical Notes

- Reuse `GenericSessionManager` from query tool implementation
- Visualization prompts should follow same structure as `visualize-query.md`
- Consider extracting common visualization utilities to `src/core/visualization.ts`
- Session IDs should maintain tool-specific prefixes (sol-, rem-, opr-, etc.)
