# PRD: Intent Refinement via Client Agent Intelligence

**Created**: 2025-07-28
**Status**: Complete
**Owner**: Viktor Farcic
**Completed**: 2025-12-14

## Executive Summary

Simplify the recommend tool's clarification workflow by delegating intent refinement to the client agent. When users provide vague intents (detected via simple heuristic), the MCP returns guidance suggesting ways to gather more detail, leaving the intelligent client agent (Claude Code, Cursor, etc.) to decide the best approach.

**Key Principle**: The MCP provides guidance, not AI-generated questions. The client agent is autonomous and has richer context (codebase access, conversation history, user preferences) to determine how best to refine the intent.

**Design Philosophy**:
- MCP detects "intent is too vague" via simple heuristic (e.g., character count + `final` flag)
- MCP returns suggestions for gathering more detail (not prescriptive instructions)
- Client agent decides: ask questions, scan code, check docs, or any combination
- Client agent returns with refined, detailed intent

**Note**: This PRD is complementary to but independent from:
- **PRD #225 (Dockerfile Generation)**: Containerization of applications
- **PRD #226 (GitHub Actions CI/CD)**: Build and publish automation
- All three can be used together for complete code-to-Kubernetes automation, or independently as needed.

## Documentation Changes

### Files Created/Updated
- **`src/tools/recommend.ts`** - Modified - Add heuristic check and return guidance for vague intents
- **`docs/mcp-guide.md`** - MCP Documentation - Document the intent refinement workflow
- **`README.md`** - Project Overview - Document client agent collaboration pattern

### User Journey Validation
- [ ] **Heuristic detection**: Short intents without `final: true` trigger guidance response
- [ ] **Guidance response**: MCP returns helpful suggestions (not prescriptive instructions)
- [ ] **Client agent refinement**: Client agent gathers context and returns detailed intent
- [ ] **End-to-end flow**: Vague intent → Guidance → Refined intent → Recommendations

## Problem Statement

Users often provide brief, vague intents to the recommend tool ("deploy my app", "setup a database") that lack the detail needed for optimal recommendations.

### Current Behavior
- MCP uses AI to generate clarifying questions
- Questions are returned to the client agent
- Client agent presents questions to user
- User answers, process continues

### Current Pain Points
- **Unnecessary AI cost**: AI call to generate questions when client agent could do this
- **Limited context**: MCP only sees the intent string, not the codebase or conversation history
- **Prescriptive workflow**: MCP dictates how information should be gathered
- **Missed opportunities**: Client agent has access to code, docs, existing configs that could inform the intent

### Impact
- Extra latency and cost from AI question generation
- Suboptimal questions (MCP lacks context the client agent has)
- Rigid workflow that doesn't leverage client agent intelligence

## Solution Overview

### Simple Heuristic Approach

Replace AI-powered question generation with a simple heuristic:

1. **Detection**: If intent length < threshold (e.g., 100 characters) AND `final !== true`
2. **Response**: Return guidance suggesting ways to gather more detail
3. **Delegation**: Client agent decides how to refine the intent
4. **Completion**: Client agent calls recommend again with detailed intent and `final: true`

### Guidance Response

When a vague intent is detected, return something like:

```
The provided intent lacks detail for optimal recommendations.

To provide better recommendations, consider gathering more context:
- Ask the user clarifying questions about their application
- Scan the codebase to detect language, framework, and dependencies
- Check existing configuration files (Dockerfile, docker-compose, k8s manifests)
- Review documentation or README for deployment requirements

Return with a detailed intent that includes:
- Application type and technology stack
- Infrastructure dependencies (databases, caches, queues)
- Access requirements (public/internal, ports, protocols)
- Scaling and resource expectations

Then call recommend again with the refined intent and final: true.
```

### Workflow

**Current:**
```
User: "deploy my app" → MCP: [AI generates questions] → User: Answers → MCP: Recommendations
```

**New:**
```
User: "deploy my app" → MCP: [Heuristic detects vague] → MCP: Returns guidance → Client Agent: [Decides how to gather info] → Client Agent: Calls recommend with detailed intent → MCP: Recommendations
```

The key difference: **MCP provides guidance, client agent has autonomy** to decide the best approach based on its richer context.

## Success Criteria

### Functional Requirements
- [ ] Heuristic correctly detects vague intents (short length, missing `final: true`)
- [ ] Guidance response is clear and actionable
- [ ] Client agents can successfully refine intents using the guidance
- [ ] Refined intents produce better recommendations than vague ones

### Quality Requirements
- [ ] No AI calls for vague intent detection (pure heuristic)
- [ ] Response latency reduced compared to AI question generation
- [ ] Guidance is helpful without being prescriptive
- [ ] Works with any MCP client agent (Claude Code, Cursor, etc.)

### Integration Requirements
- [ ] Backward compatible - `final: true` bypasses heuristic check
- [ ] Existing workflows continue to function
- [ ] No breaking changes to recommend tool API

## User Workflows

### Primary Workflow: Vague Intent Refinement

**Steps**:
1. User calls recommend with vague intent: "deploy my app"
2. MCP detects vague intent (heuristic: short length, no `final: true`)
3. MCP returns guidance with suggestions for gathering context
4. Client agent (autonomously) decides how to gather info:
   - May ask user clarifying questions
   - May scan codebase for dependencies
   - May check existing configs
   - May use any combination
5. Client agent calls recommend with detailed intent and `final: true`
6. MCP generates recommendations

**Success Criteria**:
- [ ] Vague intents trigger guidance response
- [ ] Client agent successfully refines intent
- [ ] Final recommendations are comprehensive

## Implementation Milestones

### Milestone 1: Heuristic Implementation
- [ ] Add intent length threshold constant (e.g., 100 characters)
- [ ] Implement vague intent detection in recommend tool
- [ ] Return guidance response when vague intent detected
- [ ] Ensure `final: true` bypasses heuristic

### Milestone 2: Guidance Content
- [ ] Draft guidance message with suggestions
- [ ] Include what information is needed for good recommendations
- [ ] Suggest multiple approaches (questions, code scan, config check)
- [ ] Keep guidance non-prescriptive

### Milestone 3: Testing & Validation
- [ ] Test with various vague intents
- [ ] Test that `final: true` bypasses correctly
- [ ] Test end-to-end with Claude Code as client agent
- [ ] Validate recommendations improve with refined intents

### Milestone 4: Documentation
- [ ] Update `docs/mcp-guide.md` with new workflow
- [ ] Document the heuristic behavior
- [ ] Add examples of vague vs detailed intents

## Design Decisions

### Decision Log

#### 2025-12-11: Simple Heuristic Over AI Question Generation
**Decision**: Replace AI-powered question generation with simple character count heuristic

**Rationale**:
- Client agents are intelligent and have richer context than MCP (codebase, conversation history, user preferences)
- MCP generating questions is redundant - client agent can do this better
- Reduces latency and cost by eliminating an AI call
- Aligns with MCP philosophy: provide capabilities, let client decide execution
- Client agent can choose the best approach: ask questions, scan code, check docs, or any combination

**Impact**:
- No AI call for vague intent detection
- Faster response time
- Client agent has full autonomy over information gathering
- Simpler MCP implementation

#### 2025-12-11: Guidance Over Prescription
**Decision**: Return suggestions for gathering context, not instructions

**Rationale**:
- Client agents are autonomous and intelligent
- Different situations call for different approaches
- Client may find approaches we didn't suggest
- Prescriptive instructions limit client agent creativity

**Impact**:
- Guidance is framed as "consider" not "you must"
- Multiple suggestions provided, client chooses
- Client can ignore suggestions entirely if it has a better approach

#### 2025-11-16: Local Project Focus
**Decision**: Analyze local project directory (cwd) instead of remote repositories

**Rationale**:
- Users invoke MCP client while already in their project directory
- Eliminates git operations, authentication, and cloning complexity
- Faster analysis with direct file system access
- Natural workflow: developers work locally, deploy from local

**Impact**:
- No git/repository handling code needed
- No authentication or remote access logic
- Client agent uses its native file access capabilities

## Risks & Mitigation

### Risk: Heuristic Too Simple
**Impact**: Low - May miss some vague intents or flag detailed ones
**Probability**: Medium
**Mitigation**:
- Start with conservative threshold
- Tune based on real-world usage
- `final: true` always bypasses, so users have control

### Risk: Client Agent Doesn't Refine Well
**Impact**: Medium - Poor recommendations if intent stays vague
**Probability**: Low (modern client agents are capable)
**Mitigation**:
- Clear guidance on what information is needed
- Client agent can always ask user for help
- User can manually provide detailed intent

### Risk: Guidance Not Helpful
**Impact**: Low - Client agent may not know what to do
**Probability**: Low
**Mitigation**:
- Provide multiple concrete suggestions
- Include examples of what good intents look like
- Iterate guidance based on feedback

## Dependencies

### Prerequisites
- Existing recommend tool with `final` parameter support
- Client agent capable of gathering context (code access, user interaction)

### Integration Dependencies
- Recommend tool API (no breaking changes)
- PRD #225 (Dockerfile) and PRD #226 (CI/CD) are complementary but independent

## Work Log

### 2025-12-11: Simplified to Heuristic-Based Approach
**Completed Work**:
- Replaced AI-powered question generation with simple heuristic (character count)
- Changed from prescriptive instructions to guidance suggestions
- Emphasized client agent autonomy - MCP provides suggestions, client decides
- Removed slash command development phase (no longer needed)
- Updated milestones to reflect simpler implementation
- Renamed PRD to "Intent Refinement via Client Agent Intelligence"

**Rationale**: Client agents have richer context than MCP and can make better decisions about how to gather information. Eliminates redundant AI call, reduces latency and cost.

### 2025-11-18: Scope Clarification and PRD Relationships
**Completed Work**:
- Clarified that PRD #22 focuses solely on project analysis and intent generation
- Documented relationship with PRD #225 (Dockerfile) and PRD #226 (CI/CD)
- Emphasized independence: PRDs can be used together or separately

**Rationale**: Keep each PRD focused on a single responsibility while enabling them to work together for complete workflows

### 2025-11-16: Strategic Pivot to Prompt-Based Implementation
**Completed Work**:
- Refactored PRD #22 from custom analysis engine to MCP prompt template approach
- Changed focus from remote repositories to local project analysis

**Rationale**: Leverage client agent's existing capabilities rather than building duplicate functionality in MCP server

### 2025-07-28: PRD Refactoring to Documentation-First Format
**Completed Work**: Refactored PRD #22 to follow new documentation-first guidelines.

---

## Appendix

### Example: Vague Intent Interaction

**User calls recommend:**
```
intent: "deploy my app"
```

**MCP response (heuristic triggered):**
```json
{
  "success": true,
  "needsRefinement": true,
  "guidance": {
    "message": "The provided intent lacks detail for optimal recommendations.",
    "suggestions": [
      "Ask the user clarifying questions about their application",
      "Scan the codebase to detect language, framework, and dependencies",
      "Check existing configuration files (Dockerfile, docker-compose, k8s manifests)",
      "Review documentation or README for deployment requirements"
    ],
    "neededInfo": [
      "Application type and technology stack",
      "Infrastructure dependencies (databases, caches, queues)",
      "Access requirements (public/internal, ports, protocols)",
      "Scaling and resource expectations"
    ]
  }
}
```

**Client agent (autonomously) gathers info and calls recommend again:**
```
intent: "Deploy a Node.js Express REST API on port 3000, requiring PostgreSQL database and Redis cache. Public access via ingress, stateless, 2+ replicas recommended."
final: true
```

**MCP generates recommendations** based on the detailed intent.

### Example: Detailed Intent (No Heuristic Triggered)

**User calls recommend:**
```
intent: "Deploy a Python FastAPI application with PostgreSQL database, Redis for caching, exposed on port 8000 with public ingress, needs 512Mi memory and 250m CPU per replica, scale to 3 replicas"
```

**MCP proceeds directly** to recommendation generation (intent is detailed enough).

## Related PRDs

### Complete Code-to-Kubernetes Workflow
When used together, these PRDs enable complete automation:

1. **PRD #22 (This PRD)**: Refine vague intent → Detailed deployment intent
2. **PRD #225**: Generate Dockerfile → Containerize application
3. **PRD #226**: Generate GitHub Actions → Build and publish images
4. **Existing recommend tool**: Generate Kubernetes manifests → Deploy application

Each PRD is independent and valuable on its own, but they work seamlessly together.