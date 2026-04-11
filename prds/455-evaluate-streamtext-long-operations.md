# PRD #455: Evaluate streamText for Long-Running Operations

## Status: Draft
## Priority: Medium
## Created: 2026-04-11

## Problem

All AI generation uses blocking `generateText`. For long multi-step agentic loops (up to 20 iterations), users get no feedback until the entire operation completes. This can mean minutes of silence.

## Solution

Evaluate where `streamText` with `onStepFinish` could provide real-time progress for CLI and REST API paths.

Key constraints:
- **MCP does not support streaming tool responses** — tool results are single-shot, so this won't help MCP clients
- CLI path could benefit from step-by-step progress output
- REST API path could benefit from server-sent events or similar
- Need to assess whether the architectural changes are worth it given MCP is the primary interface

## Success Criteria

- Clear assessment of which access paths benefit from streaming
- If adopted: real-time progress visible during multi-step operations via CLI/REST
- No regression for MCP path
- Integration tests pass

## Milestones

- [ ] Assess which access paths (CLI, REST, MCP) can benefit from streaming
- [ ] Prototype `streamText` with `onStepFinish` in the tool loop
- [ ] Evaluate UX improvement vs. implementation complexity
- [ ] Decide go/no-go based on prototype findings
- [ ] If go: implement streaming for applicable access paths
- [ ] Integration tests passing
