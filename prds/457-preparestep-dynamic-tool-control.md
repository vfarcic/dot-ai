# PRD #457: Use prepareStep for Dynamic Tool Control in Agentic Loops

## Status: Draft
## Priority: Low
## Created: 2026-04-11

## Problem

Agentic loops pass all tools for every step, regardless of where the agent is in its reasoning process. This means:
- The model must consider all tools at every step, consuming context
- No ability to guide the agent through phases (e.g., investigate first, then act)
- Tool choice cannot be narrowed as the agent progresses

## Solution

Use the Vercel AI SDK's `prepareStep` callback to dynamically adjust available tools, system prompt, or tool choice per step:
- After investigation steps, restrict to action tools only
- Adjust system prompt based on what the agent has learned so far
- Force specific tool choice when the agent should take a known next step

Key considerations:
- Need to identify which tool loops would benefit from phased tool access
- Overly aggressive tool narrowing could prevent the agent from recovering
- Should be opt-in per tool loop configuration, not a global change
- Requires understanding common agent step patterns across different operations

## Success Criteria

- `prepareStep` used in at least one tool loop where phased access improves results
- No regression in agent completion quality
- Configurable per tool loop
- Integration tests pass

## Milestones

- [ ] Analyze agent step patterns to identify where dynamic tool control would help
- [ ] Implement `prepareStep` in one tool loop as prototype
- [ ] Evaluate impact on agent quality and token usage
- [ ] Decide go/no-go for broader adoption
- [ ] If go: extend to additional tool loops
- [ ] Integration tests passing
