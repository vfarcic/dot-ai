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
| Visualization AI re-fetches data instead of using provided data | High latency, unnecessary cost | Store actual results in session (not tool metadata), remove prompt language encouraging tool usage |
| `toolCallsExecuted` loses input/output due to undefined serialization | Empty data in visualization prompt | Ensure tool outputs are captured; convert undefined to null before storage |

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
- [x] Add session storage to recommend stage
- [x] Create `prompts/visualize-recommend.md`
- [x] Return `visualizationUrl` in recommend response
- [x] Integration tests for recommend visualization

### Milestone 2.5: Visualization Data Quality Fix (Blocking)
**Priority**: Must complete before continuing with other tools - affects all visualization

- [x] Fix `toolCallsExecuted` serialization to preserve `input`/`output` fields (convert undefined to null)
- [x] Fix Vercel provider to capture tool results during execution (not reconstruct from steps)
- [x] Update `prompts/visualize-query.md` to clarify: use provided data first, fetch additional detail for enrichment
- [x] Update `prompts/visualize-recommend.md` similarly
- [x] Verify provided data appears in prompt (not empty/stripped) - confirmed via integration tests
- [ ] Validate visualization data quality for all other tools (recommend, remediate, operate, manageOrgData) - same verification as query tool

### Milestone 2.6: Mermaid Diagram Validation
**Priority**: High - prevents broken visualizations from reaching Web UI

- [x] Add `mermaid` npm package for diagram validation
- [x] Create `validate_mermaid` tool that parses Mermaid syntax and returns validation result
- [x] Add tool to visualization tool loop (all visualize-* prompts)
- [x] Tool description instructs AI to validate before returning (no prompt changes needed)
- [x] Integration tests for Mermaid validation (verify validate_mermaid in toolsUsed when Mermaid present)

**Mermaid Generation Guidelines** (added to visualization prompts):

- If using `classDef`, ALWAYS specify both `fill` AND `color` (text) with sufficient contrast for readability
- Truncate UUIDs to first 8 characters (e.g., `pvc-508555a4...`)
- Keep node labels under 30 characters when possible

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
| 2026-01-02 | Milestone 2 complete: recommend tool returns `visualizationUrl` with multi-session support (session IDs joined by `+`), created `prompts/visualize-recommend.md`, updated visualization endpoint to handle multiple sessions, integration tests added |
| 2026-01-02 | Design decisions documented: (1) Multi-session URL format using `+` separator, (2) Data-first visualization approach, (3) Visualization prompts should not encourage tool usage. Bug identified: `toolCallsExecuted` loses input/output data during JSON serialization |
| 2026-01-02 | Milestone 2.5 mostly complete: Fixed Vercel provider to capture tool results during execution (not reconstruct from steps), fixed serialization to preserve undefined as null, updated visualization prompts. Verified via integration tests: data now appears in prompts (before: 70K tokens with null data, after: 4K tokens with actual data, 60% fewer tool calls during visualization) |
| 2026-01-02 | Milestone 2.6 added: Mermaid validation via AI tool. Issue discovered during Web UI testing: AI generated `classDist` instead of `classDef`. Solution: provide validate_mermaid tool so AI can self-validate and fix errors before returning |
| 2026-01-02 | Milestone 2.6 complete: Added `mermaid` npm package, created `validate_mermaid` tool in `src/core/mermaid-tools.ts`, added to visualization tool loop in `rest-api.ts`, tool description instructs AI to validate (no prompt changes needed), tests verify `validate_mermaid` in `toolsUsed` when Mermaid visualizations are present |

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

## Design Decisions

### Decision 1: Multi-Session URL Format
- **Date**: 2026-01-02
- **Decision**: Use `+` as separator for multiple session IDs in visualization URLs (e.g., `/v/sol-123+sol-456+sol-789`)
- **Rationale**: Tools like `recommend` create multiple sessions (one per solution). Instead of creating a duplicate "visualization session" containing all data, we reuse existing sessions and compose them via URL
- **Impact**:
  - Avoids data duplication in session storage
  - Visualization endpoint must parse `+` separated IDs and fetch multiple sessions
  - Web UI must be updated to handle multi-session URLs
- **Owner**: Discussion during Milestone 2 implementation

### Decision 2: Data-First Visualization (vs Tool Call Metadata)
- **Date**: 2026-01-02
- **Decision**: Visualization prompts should receive the actual gathered data/results, not technical tool call metadata (`toolCallsExecuted`)
- **Rationale**: For visualization, what matters is "what was found" (capability descriptions, resources, etc.), not "which tools were called with what parameters"
- **Impact**:
  - Session storage should include aggregated results data, not just tool call structure
  - Prompts should be updated to analyze provided data instead of re-fetching
  - **Bug identified**: Current `toolCallsExecuted` storage loses `input`/`output` fields due to `JSON.stringify` dropping `undefined` values
- **Owner**: To be addressed in follow-up work

### Decision 3: Visualization Should Use Provided Data First, Then Enrich
- **Date**: 2026-01-02
- **Decision**: Visualization prompts should analyze provided data first, then fetch additional detail for enrichment. Visualization should be richer than the MCP text output.
- **Rationale**: Current implementation passes empty data (serialization bug), forcing AI to re-fetch everything. Fix is ensuring base data is available; AI can still call tools for additional enrichment to create more detailed visualizations.
- **Impact**:
  - Fix data serialization so provided data is actually available
  - Prompts should clarify: use provided data as foundation, fetch more for enrichment
  - Visualization can be more detailed than MCP tool output (this is desirable)
- **Owner**: To be addressed in Milestone 2.5

### Decision 4: Mermaid Validation via AI Tool
- **Date**: 2026-01-02
- **Decision**: Provide a `validate_mermaid` tool to the visualization AI and instruct it to validate diagrams before returning
- **Rationale**: AI occasionally generates Mermaid syntax errors (e.g., `classDist` instead of `classDef`). Rather than post-processing validation, the AI can self-validate and fix errors in context.
- **Impact**:
  - Add `mermaid` npm package as dependency
  - Create validation tool that parses Mermaid and returns errors
  - Update all visualization prompts to require validation before returning
  - AI can iterate to fix errors rather than returning broken diagrams
- **Owner**: Milestone 2.6 implementation

## Open Questions (Resolved)

| Question | Resolution | Date |
|----------|------------|------|
| How to handle multi-solution visualization URLs? | Use `+` separator for session IDs, reuse existing sessions | 2026-01-02 |
| Should we create separate visualization sessions? | No - reuse existing tool sessions to avoid duplication | 2026-01-02 |
| What data should visualization prompts receive? | Actual results/data, not tool call metadata | 2026-01-02 |
| How to prevent Mermaid syntax errors in visualizations? | Provide validate_mermaid tool, instruct AI to validate before returning | 2026-01-02 |
