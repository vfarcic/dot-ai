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

Only the `query` tool returns visualization URLs for the Web UI (PRD #317). Other tools (`recommend`, `remediate`, `operate`, `version`, `projectSetup`) return complex data that would benefit significantly from visual representation but lack Web UI integration.

**Key insight**: Each tool returns fundamentally different data that requires tailored visualization:
- `recommend`: Solutions need comparison cards and resource topology diagrams
- `remediate`: Investigation paths need flowcharts, actions need risk-colored cards
- `operate`: Changes need before/after diffs and change topology
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

### 4. recommend - generateManifests (Medium Priority)

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

### 5. version (Medium Priority)

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

### 6. projectSetup - reportScan (Medium Priority)

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
- [~] Integration tests for recommend visualization - **INCOMPLETE**: tests only verify URL is returned, not that visualization endpoint works (see Milestone 2.7)

### Milestone 2.5: Visualization Data Quality Fix (Blocking)
**Priority**: Must complete before continuing with other tools - affects all visualization

- [x] Fix `toolCallsExecuted` serialization to preserve `input`/`output` fields (convert undefined to null)
- [x] Fix Vercel provider to capture tool results during execution (not reconstruct from steps)
- [x] Update `prompts/visualize-query.md` to clarify: use provided data first, fetch additional detail for enrichment
- [x] Update `prompts/visualize-recommend.md` similarly
- [x] Verify provided data appears in prompt (not empty/stripped) - confirmed via integration tests
- [x] Validate visualization data quality for remediate and operate tools - confirmed session data is rich and structured

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

### Milestone 2.7: recommend Visualization Validation (Retroactive)
**Priority**: Must complete before Milestone 3 - recommend tests are incomplete

- [x] Add integration test that calls `/api/v1/visualize/{sessionIds}` for recommend
- [x] Verify visualization endpoint returns valid visualizations (not errors)
- [x] Run with `DEBUG_DOT_AI=true` and inspect debug prompts to verify session data is populated
- [x] Verify AI uses provided solution data first (not re-fetching from scratch)
- [x] Verify AI calls tools for enrichment data it might be missing
- [x] Manual Web UI test: open visualizationUrl and confirm rendering works

**Bug Fix**: REST API was passing `toolCallsData` instead of `solutionsData` for single recommend sessions. Fixed by making data field selection tool-aware in `rest-api.ts`.

### Milestone 2.8: Visualization Cache Reload Parameter
**Priority**: Should complete before Milestone 3 - enables seeing updated session state after execution

- [x] Pass `url.searchParams` to `handleVisualize` function in route handler
- [x] Add `searchParams: URLSearchParams` parameter to `handleVisualize` signature
- [x] Check for `reload=true` query parameter before cache check
- [x] Skip cache and regenerate visualization when `reload=true`
- [x] Integration tests: verify cached response without param, fresh response with `?reload=true`

**Applies to ALL tools** - not remediate-specific.

### Milestone 3: remediate Tool Visualization
**Implementation:**
- [x] Add session storage to remediate analysis stage (store `finalAnalysis` in session)
- [x] Create unified `prompts/visualize.md` (replaces tool-specific prompts - see Decision 8)
- [x] Return `visualizationUrl` in remediate analysis response
- [x] Visualization prompt adapts based on session status (analysis_complete vs executed_*)

**Integration Tests:**
- [x] Test that `visualizationUrl` is returned in response
- [x] Test that calling `/api/v1/visualize/{sessionId}` returns valid visualizations
- [x] Test that `validate_mermaid` is in `toolsUsed` when Mermaid diagrams present

**Data Quality Validation (DEBUG_DOT_AI=true):**
- [x] Inspect debug prompts: verify `finalAnalysis` data is populated (rootCause, confidence, factors, actions)
- [x] Verify AI uses provided data first (not re-investigating the issue)
- [x] Verify AI calls tools for additional context it might need (e.g., current resource state)

**Manual Web UI Test:**
- [x] Open visualizationUrl in browser and confirm all visualizations render correctly

### Milestone 4: operate Tool Visualization
**Implementation:**
- [ ] Add session storage to operate analysis stage (store `proposedChanges`, `commands`, context)
- [ ] Create `prompts/visualize-operate.md`
- [ ] Return `visualizationUrl` in operate analysis response

**Integration Tests:**
- [ ] Test that `visualizationUrl` is returned in response
- [ ] Test that calling `/api/v1/visualize/{sessionId}` returns valid visualizations
- [ ] Test that `validate_mermaid` is in `toolsUsed` when Mermaid diagrams present

**Data Quality Validation (DEBUG_DOT_AI=true):**
- [ ] Inspect debug prompts: verify operation data is populated (intent, changes, commands, risk)
- [ ] Verify AI uses provided data first (not re-analyzing the operation)
- [ ] Verify AI calls tools for additional context it might need (e.g., current vs proposed state)

**Manual Web UI Test:**
- [ ] Open visualizationUrl in browser and confirm all visualizations render correctly

### Milestone 5: Medium Priority Tools
Each tool follows the same validation pattern:

**recommend/generateManifests:**
- [ ] Implementation: session storage, prompt, URL return
- [ ] Integration tests: URL returned, visualization endpoint works, mermaid validation
- [ ] Debug validation: manifest data populated, AI uses provided YAML
- [ ] Manual Web UI test

**version:**
- [ ] Implementation: session storage, prompt, URL return
- [ ] Integration tests: URL returned, visualization endpoint works, mermaid validation
- [ ] Debug validation: health/diagnostics data populated, AI uses provided status
- [ ] Manual Web UI test

**projectSetup/reportScan:**
- [ ] Implementation: session storage, prompt, URL return
- [ ] Integration tests: URL returned, visualization endpoint works, mermaid validation
- [ ] Debug validation: scan results populated, AI uses provided coverage data
- [ ] Manual Web UI test

### Milestone 6: Documentation
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
| 2026-01-02 | Milestone 2.5 complete: Validated data quality for remediate and operate tools. Analysis found two data paradigms: (1) tool call data (query uses `toolCallsExecuted`), (2) embedded/structured data (recommend uses `SolutionData`, remediate uses `finalAnalysis`, operate uses `EmbeddedContext` + `proposedChanges`). REST API fallback mechanism (`toolCallsExecuted || primarySession.data`) ensures all tools work with visualization. Removed manageOrgData/capabilities from scope (no sessions, lower value). |
| 2026-01-02 | Milestone 2.7 added (retroactive): Discovered recommend visualization tests are incomplete - they only verify `visualizationUrl` is returned but don't test the visualization endpoint, data quality, or Web UI. Added comprehensive validation requirements for all pending milestones: (1) integration test for visualization endpoint, (2) debug prompt inspection for data quality, (3) verify AI uses provided data + fetches enrichment, (4) manual Web UI test. |
| 2026-01-02 | Milestone 2.7 complete: Fixed bug where REST API passed `toolCallsData` instead of `solutionsData` for single recommend sessions (tool-aware data field selection). Added integration test that calls visualization endpoint and validates response. Verified via debug output: (1) prompt now has 64KB of solution data (was empty), (2) AI generates proper visualizations (cards, tables, feature matrices), (3) AI uses provided data first and only calls `validate_mermaid` for validation. Manual Web UI test passed. |
| 2026-01-02 | Milestone 2.8 complete: Added `?reload=true` query parameter to visualization endpoint. When set, bypasses cache and regenerates visualization from current session data. Generic implementation works for ALL tools. Integration test added to query.test.ts verifying: (1) cached response is fast (<1s), (2) reload response takes longer (AI regeneration), (3) reload response has valid structure. |
| 2026-01-02 | Milestone 3 complete: remediate tool now returns `visualizationUrl` in analysis response. Added `toolName: 'remediate'` to session data, extended `RemediateSessionData` with `BaseVisualizationData`. **Architecture change**: Consolidated all tool-specific visualization prompts into unified `prompts/visualize.md` (deleted `visualize-query.md`, `visualize-recommend.md`). REST API uses switch statement to map tool-specific data fields to unified `{{{data}}}` variable. Integration tests verify URL returned, visualization endpoint works, and `validate_mermaid` in toolsUsed. Debug validation confirmed AI uses provided `finalAnalysis` data (rootCause, confidence, factors, actions) and enriches with kubectl tools. |

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

### Decision 5: Two Visualization Data Paradigms
- **Date**: 2026-01-02
- **Decision**: Accept two distinct data paradigms for visualization based on tool architecture
- **Rationale**: Analysis revealed tools use fundamentally different data sources:
  1. **Tool call data**: `query` stores `toolCallsExecuted` array with raw tool inputs/outputs from AI tool loop
  2. **Embedded/structured data**: `recommend`, `remediate`, `operate` store pre-processed meaningful structures (solutions, root cause analysis, proposed changes)
- **Impact**:
  - Visualization prompts receive different data shapes per tool type
  - REST API fallback (`toolCallsExecuted || primarySession.data`) handles both paradigms
  - Each visualization prompt must be tailored to its tool's data structure
  - Embedded data is often higher quality for visualization (already semantically meaningful)
- **Data by tool**:
  - `query`: `toolCallsExecuted` array
  - `recommend`: `SolutionData` (intent, score, resources, patterns)
  - `remediate`: `finalAnalysis` (root cause, confidence, factors, actions with risk levels)
  - `operate`: `EmbeddedContext` (patterns, policies, capabilities) + `proposedChanges` + `commands`
- **Owner**: Documented during Milestone 2.5 validation

### Decision 6: Visualization Cache Reload Parameter
- **Date**: 2026-01-02
- **Decision**: Add `?reload=true` query parameter to visualization endpoint to regenerate visualization from current session data instead of returning cached version
- **Rationale**: Session data can change after initial visualization (e.g., remediate session updated with execution results after user approves). Users need ability to see updated visualization reflecting latest session state.
- **Impact**:
  - Add `searchParams` parameter to `handleVisualize` function
  - Skip cache check when `reload=true` is present
  - Regenerate visualization using current session data
  - Update cache with new visualization
  - Applies to ALL tools, not just remediate
- **Use cases**:
  - `GET /api/v1/visualize/rem-xxx` → Returns cached visualization (pre-execution state)
  - `GET /api/v1/visualize/rem-xxx?reload=true` → Regenerates from current session (post-execution state with results)
- **Owner**: To be implemented in Milestone 2.8

### Decision 7: Remediate Session-Per-Stage Visualization
- **Date**: 2026-01-02
- **Decision**: Each remediate session generates its own visualization URL. Different execution paths create different sessions.
- **Rationale**: Remediate has two execution paths with different session behaviors:
  1. **Choice 1 (MCP execution)**: Same session (`rem-xxx`) is updated with `executionResults`
  2. **Choice 2 (Agent execution)**: Agent calls remediate again for validation, creating a NEW session (`rem-yyy`)
- **Impact**:
  - Analysis stage returns `visualizationUrl` for session `rem-xxx`
  - Choice 1: Same URL, use `?reload=true` to see execution results
  - Choice 2: Validation creates new session with its own `visualizationUrl`
  - Visualization prompt adapts based on session status (`analysis_complete` vs `executed_successfully`)
- **Session status determines content**:
  - `analysis_complete`: Shows investigation flow, root cause, proposed actions
  - `executed_successfully`/`executed_with_errors`: Shows investigation + execution results + success/failure
- **Owner**: Implemented in Milestone 3

### Decision 8: Unified Visualization Prompt
- **Date**: 2026-01-02
- **Decision**: Consolidate all tool-specific visualization prompts into a single `prompts/visualize.md` template
- **Rationale**: Tool-specific guidance was redundant - the AI can infer what visualizations are valuable from the data structure itself (e.g., seeing `confidence: 0.98` and `risk: "low"` tells the AI what to highlight without explicit instructions)
- **Changes**:
  - Deleted: `prompts/visualize-query.md`, `prompts/visualize-recommend.md`
  - Created: `prompts/visualize.md` with `{{{intent}}}` and `{{{data}}}` template variables
  - Updated `getPromptForTool()` in `src/core/visualization.ts` to return `'visualize'` for all tools
  - REST API switch statement in `handleVisualize` maps tool-specific data fields to unified `data` variable:
    - `query`: `intent` from session, `data` from `toolCallsExecuted || session.data`
    - `recommend`: `intent` from session, `data` from solution data
    - `remediate`: `intent` from `issue` field, `data` from `finalAnalysis || session.data`
    - `operate`: `intent` from session, `data` from full session data
- **Benefits**:
  - Single source of truth for visualization prompt structure
  - Easier maintenance - no need to update multiple prompts
  - Consistent visualization behavior across all tools
  - AI adapts naturally to different data structures
- **Owner**: Implemented during Milestone 3

## Open Questions (Resolved)

| Question | Resolution | Date |
|----------|------------|------|
| How to handle multi-solution visualization URLs? | Use `+` separator for session IDs, reuse existing sessions | 2026-01-02 |
| Should we create separate visualization sessions? | No - reuse existing tool sessions to avoid duplication | 2026-01-02 |
| What data should visualization prompts receive? | Actual results/data, not tool call metadata | 2026-01-02 |
| How to prevent Mermaid syntax errors in visualizations? | Provide validate_mermaid tool, instruct AI to validate before returning | 2026-01-02 |
| How to see updated visualization after session changes? | Add `?reload=true` query parameter to skip cache and regenerate | 2026-01-02 |
| Should remediate analysis and execution share visualization? | Each session generates its own URL; Choice 1 updates same session (use reload), Choice 2 creates new session | 2026-01-02 |
