# PRD #316: Unified Chat Endpoint for Web UI

## Overview

| Field | Value |
|-------|-------|
| **PRD ID** | 316 |
| **Feature Name** | Unified Chat Endpoint for Web UI |
| **Priority** | High |
| **Status** | Draft |
| **Created** | 2025-12-30 |
| **Last Updated** | 2025-12-30 |

## Problem Statement

The Web UI (dot-ai-ui repo) is a presentation layer without AI capabilities. Currently, the REST API exposes separate endpoints per tool:
- POST /api/v1/tools/recommend
- POST /api/v1/tools/remediate
- POST /api/v1/tools/operate
- POST /api/v1/tools/manageOrgData
- POST /api/v1/tools/projectSetup
- POST /api/v1/tools/query
- POST /api/v1/tools/version

The Web UI cannot determine which endpoint to call based on natural language input like "deploy my app" vs "fix this pod crash" vs "scale my database".

## Solution

A lightweight chat agent HTTP endpoint that:
1. Receives natural language messages from the Web UI
2. Uses AI to decide whether to use a tool, ask for clarification, or respond directly
3. Maintains workflow state for multi-turn tool interactions
4. Returns structured responses with visualizations

**Key Design Decisions:**
- **Stateless chat**: Web UI sends last response + new message (not full history). MCP stays stateless.
- **Tool workflow state**: Underlying tools maintain their own workflow state via sessionId, passed through in responses.
- **HTTP-only endpoint**: This is NOT an MCP tool. It exists solely for Web UI consumption.
- **AI-powered routing**: Every message goes through AI to determine intent and action.

## API Design

### Endpoint

`POST /api/v1/chat`

### Request

```json
{
  "message": "deploy a postgres database",
  "lastResponse": {
    "message": "Previous assistant response...",
    "visualizations": [...],
    "toolUsed": "recommend",
    "workflowState": {
      "sessionId": "rec-abc123",
      "stage": "chooseSolution",
      "data": { ... }
    }
  }
}
```

- `message` (required): User's natural language input
- `lastResponse` (optional): The previous response from the chat endpoint. Omit for first message in conversation.

### Response

```json
{
  "message": "Here are the available solutions for PostgreSQL deployment:",
  "visualizations": [
    {
      "type": "cards",
      "data": {
        "items": [
          { "id": "sol-1", "title": "PostgreSQL Operator", "tags": ["HA", "recommended"] },
          { "id": "sol-2", "title": "Helm Chart", "tags": ["simple"] }
        ]
      }
    }
  ],
  "toolUsed": "recommend",
  "workflowState": {
    "sessionId": "rec-abc123",
    "stage": "chooseSolution",
    "data": { "solutionIds": ["sol-1", "sol-2"] }
  }
}
```

- `message`: Human-readable response text
- `visualizations`: Array of visualization objects for the Web UI to render
- `toolUsed`: Which tool was invoked (null if no tool was used)
- `workflowState`: Opaque state object to pass back in next request

## Intent Classification

The AI agent classifies user messages to determine the appropriate action:

| User Intent Pattern | Tool |
|---------------------|------|
| deploy, create, setup, install, run, launch, add | recommend |
| fix, remediate, troubleshoot, why is, what's wrong, debug | remediate |
| scale, update, rollback, delete, restart, modify | operate |
| patterns, policies, capabilities, scan cluster | manageOrgData |
| setup project, audit repo, add README, add LICENSE | projectSetup |
| what pods, show deployments, describe, list, get | query |
| version, health, status (of MCP server itself) | version |
| General questions, clarifications, off-topic | No tool - direct AI response |

**Important**: The AI is given the full list of available tools with descriptions and decides based on context, not just keyword matching. This allows for:
- Ambiguous inputs to trigger clarification questions
- Natural conversation flow
- Graceful handling of unsupported requests

## Workflow Continuation

When a tool returns a multi-step workflow:

1. **Initial request**: User says "deploy postgres"
2. **Chat endpoint**: AI calls `recommend({ intent: "deploy postgres" })`
3. **Response**: Returns solutions with `workflowState: { sessionId: "...", stage: "chooseSolution" }`
4. **User continues**: "use the first one"
5. **Chat endpoint**: Receives `lastResponse` with workflow state, AI interprets "first one" and calls `recommend({ stage: "chooseSolution", solutionId: "sol-1", sessionId: "..." })`

The AI uses `lastResponse` context to:
- Understand what was shown to the user
- Resolve references like "the first one", "option 2", etc.
- Determine which tool workflow to continue

## Success Criteria

1. Web UI can send natural language messages and receive appropriate responses
2. All existing MCP tools are accessible through the chat endpoint
3. Multi-step workflows (recommend, remediate, operate) work correctly
4. Response format is consistent and includes visualization data
5. No tool match cases receive helpful AI responses
6. Integration tests pass for all major flows

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI misclassifies intent | Wrong tool called, poor UX | Include confidence scoring; ask for clarification when uncertain |
| Workflow state lost | User has to restart multi-step flow | Clear error messages; allow restart |
| AI latency per message | Slower response times | Accept as tradeoff for simplicity; optimize prompt size |
| Token costs | Increased API costs | Keep prompts minimal; only include necessary context |

## Out of Scope (Future Enhancements)

- Full conversation history (currently: last response + new message only)
- MCP-side session persistence
- Authentication/multi-tenancy
- Streaming responses
- Voice/audio input

## Milestones

### Milestone 1: Core Chat Infrastructure
- [ ] Create `/api/v1/chat` HTTP endpoint in REST server
- [ ] Implement request/response types matching API design
- [ ] Create AI prompt template for intent classification
- [ ] Basic tool routing (recommend, remediate, operate, query, version)

### Milestone 2: Tool Integration
- [ ] Integrate all existing tools (manageOrgData, projectSetup)
- [ ] Implement workflow state passthrough for multi-step tools
- [ ] Handle tool errors gracefully with user-friendly messages

### Milestone 3: AI Response Quality
- [ ] Direct AI responses for non-tool queries
- [ ] Clarification questions for ambiguous intents
- [ ] Context-aware interpretation of user references ("the first one", "option 2")

### Milestone 4: Visualization Support
- [ ] Pass through visualization data from tool responses
- [ ] Consistent response format across all tools and direct responses

### Milestone 5: Integration Tests
- [ ] Test coverage for intent classification
- [ ] Test coverage for each tool routing
- [ ] Test coverage for workflow continuation
- [ ] Test coverage for error scenarios

### Milestone 6: Documentation
- [ ] API documentation for Web UI developers
- [ ] Update existing docs to mention chat endpoint

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-30 | PRD created |

## Dependencies

- Existing MCP tools (recommend, remediate, operate, query, manageOrgData, projectSetup, version)
- Claude AI integration (`src/core/claude.ts`)
- REST server infrastructure (`src/interfaces/rest.ts`)
- Visualization response types

## Technical Notes

- Endpoint is HTTP-only, not exposed as MCP tool
- Uses existing Claude integration for AI calls
- Leverages existing tool implementations - chat is a routing layer
- Follow existing REST API patterns for consistency
