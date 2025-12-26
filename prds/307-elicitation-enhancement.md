# PRD 307: Elicitation Enhancement Across MCP Tools

## Status: Draft
## Priority: Medium
## GitHub Issue: #307

---

## Problem Statement

MCP tools currently have inconsistent and limited elicitation patterns:
- Some tools proceed without confirming understanding of user intent
- Questions are generated once and not refined based on answers
- Users cannot guide investigations or clarify intent during workflows
- No confirmation step before taking significant actions
- Guidance is generic rather than context-aware

This leads to suboptimal recommendations, wasted iterations, and user frustration when the system misunderstands requirements.

## Solution Overview

Systematically review each MCP tool and workflow step to determine where elicitation would improve user outcomes. For each candidate, decide whether to add:
- **Confirmation**: "Did I understand correctly?"
- **Clarification**: "Can you tell me more about X?"
- **Adaptive questioning**: Follow-up questions based on previous answers
- **Guided refinement**: Help users provide better input
- **No change**: Some steps don't benefit from elicitation

## Approach

For each tool and workflow step, evaluate:

1. **Does the user provide input?** If not, elicitation isn't applicable.
2. **Is misunderstanding costly?** If errors are easily fixed, confirmation may be overkill.
3. **Is the input ambiguous?** Ambiguous inputs benefit from clarification.
4. **Do answers inform follow-up questions?** Adaptive questioning adds value here.
5. **Is the action significant/irreversible?** Confirmation before execution is warranted.

## Success Criteria

1. Each tool/workflow step has been explicitly evaluated for elicitation
2. Decisions are documented with rationale (add elicitation vs. not needed)
3. Implemented elicitation patterns are consistent across tools
4. User testing validates that elicitation improves outcomes without adding friction
5. Integration tests cover elicitation flows

## Out of Scope

- Changing core tool functionality (focus is on elicitation layer)
- AI model changes (use existing Claude integration)
- New tools (focus on existing tools only)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Over-elicitation adds friction | Evaluate each step; skip where not beneficial |
| Inconsistent patterns confuse users | Define standard elicitation patterns to reuse |
| Scope creep | Checklist approach bounds the work |

---

## Milestones

- [ ] **Milestone 1**: Generate comprehensive checklist of all MCP tools and workflow steps
- [ ] **Milestone 2**: Evaluate each item and document elicitation decisions
- [ ] **Milestone 3**: Define reusable elicitation patterns (confirmation, clarification, adaptive)
- [ ] **Milestone 4**: Implement elicitation for all selected items
- [ ] **Milestone 5**: Integration tests for elicitation flows
- [ ] **Milestone 6**: User validation and refinement

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-26 | PRD created |

---

## Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Checklist generated at work time | 2025-12-26 | Tools/workflows may change before implementation |
| Evaluate don't assume | 2025-12-26 | Not every step needs elicitation; avoid over-engineering |

---

## Open Questions

1. What level of elicitation friction is acceptable to users?
2. Should elicitation be optional/configurable per user preference?
3. How do we measure elicitation effectiveness?
