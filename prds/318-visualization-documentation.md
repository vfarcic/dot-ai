# PRD #318: Visualization Feature Documentation

## Overview

| Field | Value |
|-------|-------|
| **PRD ID** | 318 |
| **Feature Name** | Visualization Feature Documentation |
| **Priority** | Low |
| **Status** | Complete |
| **Created** | 2025-12-31 |
| **Last Updated** | 2026-01-01 |

## Problem Statement

The visualization feature (PRD #317) is implemented and working, but lacks user-facing documentation. Users need to know:
- How to enable visualization URLs in tool responses
- What the new output fields mean
- Where to find the Web UI for viewing visualizations

## Solution

Document the visualization feature across existing documentation:
1. Document `WEB_UI_BASE_URL` environment variable configuration
2. Update tool output examples to show new `sessionId` and `visualizationUrl` fields
3. Add links/references to Web UI documentation

## Scope

### In Scope
- Environment variable documentation
- Tool output example updates
- Cross-references to Web UI docs

### Out of Scope
- Web UI documentation itself (separate repo/docs)
- API documentation for `/api/v1/visualize/{sessionId}` (internal to Web UI)
- Visualization prompt internals

## Milestones

### Milestone 1: Environment Variable Documentation
- [x] Document `WEB_UI_BASE_URL` in Helm chart values
- [x] Add configuration example to deployment docs
- [x] Explain feature toggle behavior (disabled when not set)

### Milestone 2: Tool Output Documentation
- [x] Update query tool output examples to show `sessionId` and `visualizationUrl`
- [x] Document the URL format and what it links to
- [x] Add note about Web UI requirement for visualization viewing

### Milestone 3: Web UI Cross-References
- [x] Add link to Web UI documentation/repo
- [x] Brief explanation of visualization capabilities
- [x] User journey from MCP tool → Web UI visualization

## Success Criteria

1. Users can find and configure `WEB_UI_BASE_URL`
2. Tool output documentation matches actual responses
3. Clear path from tool response to viewing visualizations

## Dependencies

- PRD #317 (Visualization Endpoint) - Complete
- Web UI repository/documentation - Should exist before completing Milestone 3

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-31 | PRD created - split from PRD #317 Milestone 6 |
| 2026-01-01 | Completed all milestones: added Web UI Visualization section to kubernetes-setup.md, updated mcp-query-guide.md with real example and visualization screenshot |
