# PRD: Migrate from Prompt-Based to Tool-Based Agentic AI Architecture

**Status**: In Progress
**Created**: 2025-10-03
**GitHub Issue**: [#136](https://github.com/vfarcic/dot-ai/issues/136)
**Priority**: High
**Complexity**: High

---

## Problem Statement

The current AI integration architecture uses a **prompt-based pattern** that injects massive amounts of context data directly into prompts:

### Current Issues

1. **Context Bloat**
   - Sending 415+ cluster API resources in every `remediate.ts` investigation prompt
   - Pre-fetching 50 capabilities and injecting all into `recommend.ts` prompts
   - Token waste: 90%+ of injected data unused by AI

2. **Manual Agentic Loops**
   - 400+ lines of loop management code in `remediate.ts` (lines 204-304)
   - Custom JSON parsing and validation logic
   - Fragile state management across iterations

3. **Rigid Data Fetching**
   - AI cannot dynamically request only what it needs
   - All data pre-loaded "just in case"
   - No ability to adapt investigation path based on findings

4. **Maintenance Burden**
   - Complex prompt template variable replacement
   - Error-prone JSON response parsing
   - Difficult to debug AI decision-making

### Impact

- **Cost**: Excessive token usage (70-90% wasted input tokens)
- **Performance**: Slower due to processing massive unused context
- **Developer Experience**: Complex code that simulates agent behavior
- **Reliability**: JSON parsing failures, prompt engineering fragility

---

## Solution Overview

Migrate to **native AI tool use** pattern where AI autonomously decides which tools to call. This works across all providers (Anthropic, OpenAI, Google) through our unified `AIProvider` interface.

### Current Architecture (Post-PRD #73)

As of PRD #73 (merged Oct 5, 2025), we have a multi-provider AI architecture:

```typescript
// Current: AIProvider interface supports multiple providers
interface AIProvider {
  sendMessage(message: string, operation?: string): Promise<AIResponse>;
  isInitialized(): boolean;
  getDefaultModel(): string;
  getProviderType(): string;
}

// Two implementations:
class AnthropicProvider implements AIProvider { /* uses @anthropic-ai/sdk */ }
class VercelProvider implements AIProvider { /* uses Vercel AI SDK for OpenAI/Google */ }
```

### Proposed Enhancement

Add tool use methods to `AIProvider` interface:

```typescript
// Before (Prompt-Based) - Current State
const prompt = loadPrompt('remediate-investigation.md')
  .replace('{clusterApiResources}', massiveClusterData); // ❌ 10,000+ tokens
const response = await aiProvider.sendMessage(prompt);
const { dataRequests } = parseAIResponse(response.content); // ❌ Manual parsing

// After (Tool-Based) - Via AIProvider Interface
const tools = [
  { name: "kubectl_get", description: "Get K8s resources", schema: {...} },
  { name: "kubectl_describe", description: "Detailed resource info", schema: {...} }
];

const result = await aiProvider.toolLoop({
  systemPrompt: "Investigate Kubernetes issue...",
  tools: tools,
  toolExecutor: async (toolName, input) => executeKubectl(toolName, input),
  maxIterations: 20
});

// Works seamlessly with any provider (Anthropic/OpenAI/Google)
```

### Provider-Specific Implementation

**AnthropicProvider** (uses Anthropic SDK):
```typescript
async toolLoop(config: ToolLoopConfig): Promise<AgenticResult> {
  const response = await this.client.messages.create({
    messages: conversationHistory,
    tools: tools // Native Anthropic tool use
  });
  // Handle tool_use stop_reason...
}
```

**VercelProvider** (uses Vercel AI SDK):
```typescript
async toolLoop(config: ToolLoopConfig): Promise<AgenticResult> {
  const result = await generateText({
    model: this.modelInstance,
    tools: {
      kubectl_get: tool({
        description: "Get K8s resources",
        execute: async (input) => await toolExecutor('kubectl_get', input)
      })
    }
  });
  // Handle tool calls...
}
```

### Key Benefits

1. **90% Token Reduction**: AI fetches only needed data via tool calls
2. **True Agentic Behavior**: Native AI loop vs manual iteration code
3. **Multi-Provider Support**: Works with Anthropic, OpenAI, Google
4. **Better Debugging**: Structured tool_use blocks with validation
5. **Alignment with MCP**: Natural fit for Model Context Protocol architecture

---

## Goals & Success Criteria

### Primary Goals

1. **Reduce Token Usage by 70-90%** for investigation and recommendation workflows
2. **Remove 400+ lines of manual loop code** from `remediate.ts`
3. **Enable dynamic data fetching** - AI requests only what it needs
4. **Improve code maintainability** - simpler, cleaner architecture

### Success Criteria

- [ ] `remediate.ts` uses native Claude tool use for investigation loop
- [ ] Average input token count reduced by ≥70% per investigation
- [ ] Integration tests pass for tool-based remediation
- [ ] Zero regression in recommendation quality (measured by user feedback)
- [ ] Code complexity reduced (measured by cyclomatic complexity metrics)
- [ ] A/B test shows equal or better performance vs prompt-based approach

### Non-Goals

- Migrating single-shot AI tasks (manifest generation, question generation) - these remain prompt-based
- Changing MCP server interface - this is an internal architecture change
- Rewriting existing working features - focus on architecture, not features

---

## Technical Design

### Architecture Overview (Updated for Multi-Provider)

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Tool Handler Layer                    │
│  (handleRemediateTool, handleRecommendTool, etc.)           │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌─────────────────────┐         ┌──────────────────────┐
│  Prompt-Based Path  │         │  Tool-Based Path     │
│  (Single-shot AI)   │         │  (Agentic Loops)     │
├─────────────────────┤         ├──────────────────────┤
│ • Manifest Gen      │         │ • Investigation      │
│ • Question Gen      │         │ • Resource Search    │
│ • Intent Analysis   │         │ • Script Discovery   │
└─────────────────────┘         └──────────────────────┘
         │                               │
         │       AIProvider Interface    │
         │    (Multi-Provider Support)   │
         ├───────────────┬───────────────┤
         │               │               │
         ▼               ▼               ▼
   sendMessage()   sendMessageWithTools()  toolLoop()
    (existing)         (new)                (new)
         │               │                   │
         └───────────────┴───────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌─────────────────────┐         ┌──────────────────────┐
│  AnthropicProvider  │         │   VercelProvider     │
│  (@anthropic-ai/sdk)│         │ (Vercel AI SDK)      │
├─────────────────────┤         ├──────────────────────┤
│ • Native tool use   │         │ • OpenAI GPT-4/5     │
│ • Streaming support │         │ • Google Gemini      │
│ • Claude 3.5+       │         │ • Unified tool API   │
└─────────────────────┘         └──────────────────────┘
```

### Phase 1: AIProvider Interface Extension (Week 1)

**Target**: Add tool use methods to `AIProvider` interface and implement in both providers

#### Step 1.1: Extend AIProvider Interface

Add tool use capabilities to `src/core/ai-provider.interface.ts`:

```typescript
/**
 * Tool definition for AI providers
 */
export interface AITool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Tool executor function type
 */
export type ToolExecutor = (toolName: string, input: any) => Promise<any>;

/**
 * Configuration for tool loop
 */
export interface ToolLoopConfig {
  systemPrompt: string;
  userMessage: string;
  tools: AITool[];
  toolExecutor: ToolExecutor;
  maxIterations?: number;
  onIteration?: (iteration: number, toolCalls: any[]) => void;
}

/**
 * Result from agentic tool loop
 */
export interface AgenticResult {
  finalMessage: string;
  iterations: number;
  toolCallsExecuted: Array<{
    tool: string;
    input: any;
    output: any;
  }>;
  totalTokens: {
    input: number;
    output: number;
  };
}

// Add to AIProvider interface:
export interface AIProvider {
  // Existing methods...
  sendMessage(message: string, operation?: string): Promise<AIResponse>;
  isInitialized(): boolean;
  getDefaultModel(): string;
  getProviderType(): string;

  // NEW: Tool use methods

  /**
   * Execute agentic loop with tool calling
   * AI autonomously decides which tools to call and when to stop
   */
  toolLoop(config: ToolLoopConfig): Promise<AgenticResult>;

  /**
   * Single-shot message with tool calling enabled
   * AI can call tools, but only processes one round
   */
  sendMessageWithTools(
    message: string,
    tools: AITool[],
    toolExecutor: ToolExecutor,
    operation?: string
  ): Promise<AIResponse & { toolCalls?: any[] }>;
}
```

#### Step 1.2: Implement in AnthropicProvider

Update `src/core/providers/anthropic-provider.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';

async toolLoop(config: ToolLoopConfig): Promise<AgenticResult> {
  const conversationHistory: Anthropic.MessageParam[] = [
    { role: 'user', content: config.systemPrompt + '\n\n' + config.userMessage }
  ];

  const tools: Anthropic.Tool[] = config.tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema
  }));

  let iterations = 0;
  const toolCallsExecuted: any[] = [];
  const totalTokens = { input: 0, output: 0 };

  while (iterations < (config.maxIterations || 20)) {
    iterations++;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: conversationHistory,
      tools: tools
    });

    totalTokens.input += response.usage.input_tokens;
    totalTokens.output += response.usage.output_tokens;

    // Check if AI wants to use tools
    const toolUses = response.content.filter(c => c.type === 'tool_use');

    if (toolUses.length === 0) {
      // AI is done, return final message
      const textContent = response.content.find(c => c.type === 'text');
      return {
        finalMessage: textContent?.text || '',
        iterations,
        toolCallsExecuted,
        totalTokens
      };
    }

    // Execute tools requested by AI
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const result = await config.toolExecutor(toolUse.name, toolUse.input);
      toolCallsExecuted.push({
        tool: toolUse.name,
        input: toolUse.input,
        output: result
      });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result)
      });
    }

    // Add AI response and tool results to conversation
    conversationHistory.push(
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults }
    );

    config.onIteration?.(iterations, toolCallsExecuted);
  }

  throw new Error(`Tool loop exceeded max iterations (${config.maxIterations})`);
}
```

#### Step 1.3: Implement in VercelProvider

Update `src/core/providers/vercel-provider.ts`:

```typescript
import { generateText, tool } from 'ai';
import { z } from 'zod';

async toolLoop(config: ToolLoopConfig): Promise<AgenticResult> {
  // Convert AITool[] to Vercel AI SDK tool format
  const vercelTools: Record<string, any> = {};

  for (const aiTool of config.tools) {
    // Convert JSON schema to Zod schema (simplified - may need enhancement)
    const zodSchema = z.object(
      Object.fromEntries(
        Object.entries(aiTool.inputSchema.properties).map(([key, val]) => [
          key,
          z.any().describe(val.description || '')
        ])
      )
    );

    vercelTools[aiTool.name] = tool({
      description: aiTool.description,
      parameters: zodSchema,
      execute: async (input: any) => {
        return await config.toolExecutor(aiTool.name, input);
      }
    });
  }

  const result = await generateText({
    model: this.modelInstance,
    system: config.systemPrompt,
    prompt: config.userMessage,
    tools: vercelTools,
    maxSteps: config.maxIterations || 20,
    onStepFinish: (step) => {
      config.onIteration?.(step.stepNumber, step.toolCalls || []);
    }
  });

  return {
    finalMessage: result.text,
    iterations: result.steps?.length || 1,
    toolCallsExecuted: result.toolCalls?.map(tc => ({
      tool: tc.toolName,
      input: tc.args,
      output: tc.result
    })) || [],
    totalTokens: {
      input: result.usage.promptTokens,
      output: result.usage.completionTokens
    }
  };
}
```

### Phase 2: Remediate Tool Conversion (Week 2)

**Target**: Convert `src/tools/remediate.ts` investigation loop to use new `toolLoop()` method

#### Kubectl Tool Definitions

```typescript
export const KUBECTL_TOOLS = [
  {
    name: "kubectl_get",
    description: "List Kubernetes resources of a specific type",
    input_schema: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          description: "Resource type (pods, deployments, services, etc.)"
        },
        namespace: {
          type: "string",
          description: "Namespace to query (optional, defaults to all)"
        },
        name: {
          type: "string",
          description: "Specific resource name (optional)"
        },
        labels: {
          type: "string",
          description: "Label selector (optional, e.g., 'app=nginx')"
        }
      },
      required: ["resource"]
    }
  },
  {
    name: "kubectl_describe",
    description: "Get detailed information about a specific resource",
    input_schema: {
      type: "object",
      properties: {
        resource: { type: "string", description: "Resource type and name (e.g., 'pod/my-pod')" },
        namespace: { type: "string" }
      },
      required: ["resource"]
    }
  },
  {
    name: "kubectl_logs",
    description: "Get container logs from a pod",
    input_schema: {
      type: "object",
      properties: {
        pod: { type: "string", description: "Pod name" },
        namespace: { type: "string" },
        container: { type: "string", description: "Container name (optional)" },
        previous: { type: "boolean", description: "Get logs from previous container instance" }
      },
      required: ["pod", "namespace"]
    }
  },
  {
    name: "kubectl_events",
    description: "Get Kubernetes events for troubleshooting",
    input_schema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Namespace filter (optional)" },
        fieldSelector: { type: "string", description: "Field selector (e.g., 'involvedObject.name=my-pod')" }
      }
    }
  }
];
```

#### Implementation Approach

1. **Add new method to `ClaudeIntegration`**:
   ```typescript
   async toolLoop(
     systemPrompt: string,
     tools: Tool[],
     toolExecutor: (toolName: string, input: any) => Promise<any>,
     maxIterations: number = 20
   ): Promise<AgenticResult>
   ```

2. **Replace manual loop** in `conductInvestigation()`:
   - Remove lines 204-304 (manual iteration loop)
   - Replace with call to `claudeIntegration.toolLoop()`
   - Tool executor maps tool calls to `gatherSafeData()`

3. **Update prompts**:
   - Remove `{clusterApiResources}` injection from `remediate-investigation.md`
   - Add system prompt explaining available tools
   - AI requests data via tool calls instead of JSON responses

#### Migration Strategy

- **Feature flag**: `ENABLE_TOOL_BASED_REMEDIATION=true`
- **Backward compatibility**: Keep prompt-based as fallback
- **A/B testing**: Compare token usage, latency, accuracy

### Phase 2: Recommend Tool (Weeks 3-4)

**Target**: Convert `src/tools/recommend.ts` capability search

#### New Tool Definitions

```typescript
export const CAPABILITY_TOOLS = [
  {
    name: "search_capabilities",
    description: "Search cluster capabilities by intent or keywords",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", default: 10 }
      },
      required: ["query"]
    }
  },
  {
    name: "get_resource_schema",
    description: "Get detailed Kubernetes resource schema",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string" },
        apiVersion: { type: "string" }
      },
      required: ["kind", "apiVersion"]
    }
  },
  {
    name: "search_patterns",
    description: "Search organizational patterns relevant to intent",
    input_schema: {
      type: "object",
      properties: {
        intent: { type: "string" },
        limit: { type: "number", default: 5 }
      },
      required: ["intent"]
    }
  }
];
```

#### Implementation Changes

1. Remove pre-fetching of 50 capabilities in `recommend.ts:460`
2. Let AI call `search_capabilities` with refined queries
3. AI narrows results, then calls `get_resource_schema` for top candidates
4. Replace massive `{resources}` template variable with tool calls

### Phase 3: Build Platform Tool (Weeks 5-6)

**Target**: Convert `src/tools/build-platform.ts` script discovery

#### New Tool Definitions

```typescript
export const PLATFORM_TOOLS = [
  {
    name: "discover_operations",
    description: "Discover available Nu shell platform operations",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "get_operation_parameters",
    description: "Get parameters for a specific platform operation",
    input_schema: {
      type: "object",
      properties: {
        tool: { type: "string" },
        operation: { type: "string" }
      },
      required: ["tool", "operation"]
    }
  }
];
```

---

## Implementation Plan

### Milestones (Updated for Multi-Provider)

- [ ] **Milestone 1: AIProvider Interface Extension (Week 1)**
  - Extend `AIProvider` interface with tool use methods (`toolLoop`, `sendMessageWithTools`)
  - Add new types: `AITool`, `ToolExecutor`, `ToolLoopConfig`, `AgenticResult`
  - Implement `toolLoop()` in `AnthropicProvider` using Anthropic SDK
  - Implement `toolLoop()` in `VercelProvider` using Vercel AI SDK
  - Write unit tests for both provider implementations
  - Create shared tool definition utilities

- [ ] **Milestone 2: Remediate Migration (Week 2)**
  - Define kubectl tool schemas (`kubectl_get`, `kubectl_describe`, `kubectl_logs`, `kubectl_events`)
  - Convert `remediate.ts` investigation loop to use `aiProvider.toolLoop()`
  - Remove manual iteration code (lines 204-304)
  - Update `remediate-investigation.md` prompt (remove `{clusterApiResources}`)
  - Add feature flag for gradual rollout
  - Write integration tests comparing both approaches

- [ ] **Milestone 3: Validation & Multi-Provider Testing (Week 2-3)**
  - A/B test tool-based vs prompt-based with Anthropic
  - Test tool-based remediation with OpenAI (via VercelProvider)
  - Test tool-based remediation with Google Gemini (via VercelProvider)
  - Measure token usage, latency, accuracy across providers
  - Document performance differences by provider
  - Gather user feedback

- [ ] **Milestone 4: Recommend Migration (Week 3-4)**
  - Define capability search tools (`search_capabilities`, `get_resource_schema`, `search_patterns`)
  - Convert `recommend.ts` capability search to tools
  - Remove pre-fetching of 50 capabilities
  - Update resource selection logic
  - Integration tests for recommendation quality across providers

- [ ] **Milestone 5: Platform Migration (Week 5-6)**
  - Define platform tools (`discover_operations`, `get_operation_parameters`)
  - Convert `build-platform.ts` script discovery to tools
  - Update platform operation workflow
  - End-to-end tests for platform builds

- [ ] **Milestone 6: Production Rollout (Week 6)**
  - Remove feature flags after validation
  - Remove legacy prompt-based code paths
  - Update CLAUDE.md with tool use patterns
  - Update documentation to mention multi-provider tool support
  - Announce architecture change to users

### Testing Strategy

#### Unit Tests
- Tool schema validation
- Tool executor logic
- Conversation history management
- Error handling for tool failures

#### Integration Tests
- Full investigation workflow with tool-based loop
- Comparison tests: prompt-based vs tool-based output quality
- Token usage measurements
- Latency benchmarks

#### Success Metrics
- **Token Reduction**: ≥70% reduction in average input tokens
- **Code Complexity**: ≥30% reduction in cyclomatic complexity
- **Reliability**: Zero increase in error rates
- **Performance**: Latency improvement or ≤10% regression acceptable

---

## Risks & Mitigations

### Risk 1: Increased Latency (Medium)
**Description**: Multiple round-trips for tool calls vs single prompt
**Mitigation**:
- Claude can call tools in parallel
- Net efficiency gain from smaller payloads
- Cache conversation history between calls

### Risk 2: Tool Call Failures (Medium)
**Description**: kubectl commands may fail, breaking agentic loop
**Mitigation**:
- Robust error handling in tool executor
- Feed errors back to Claude as tool results
- AI can adapt investigation path based on failures

### Risk 3: Backward Compatibility (Low)
**Description**: Breaking existing integrations
**Mitigation**:
- MCP interface unchanged - internal architecture only
- Feature flags for gradual rollout
- Keep prompt-based fallback during transition

### Risk 4: AI Tool Selection Quality (Medium)
**Description**: AI may call wrong tools or make inefficient choices
**Mitigation**:
- Clear tool descriptions and schemas
- System prompts with tool usage guidance
- Monitoring and metrics to detect poor tool usage
- Ability to revert to prompt-based if needed

---

## Open Questions

1. **Tool Call Limits**: Should we limit max tool calls per investigation? (Prevent runaway costs)
2. **Caching Strategy**: How to cache tool results across similar investigations?
3. **Parallel Tool Calls**: When should we allow Claude to call tools in parallel vs sequential?
4. **Prompt Migration**: Which prompts stay prompt-based vs convert to tools?
5. **Error Recovery**: How should AI recover from multiple consecutive tool failures?

---

## Dependencies

### Technical Dependencies
- **PRD #73**: Multi-Provider AI System (✅ Complete, merged Oct 5, 2025)
  - Provides `AIProvider` interface foundation
  - `AnthropicProvider` and `VercelProvider` implementations
  - Vercel AI SDK integration (supports tool use)
- Anthropic SDK `@anthropic-ai/sdk` (already integrated)
- Vercel AI SDK `ai` (already integrated)
- Zod schema library (already integrated, used for tool schemas)
- No new external dependencies required

### PRD Dependencies
- This PRD builds upon PRD #73's multi-provider architecture
- Must maintain compatibility with all three providers (Anthropic, OpenAI, Google)
- Tool use must work seamlessly across providers

### Team Dependencies
- API key management (tool calls may consume more credits initially)
- Monitoring/alerting for token usage changes across providers
- Performance monitoring to track provider-specific tool use latency
- User communication about potential behavior changes

---

## Documentation Updates

- [ ] Update `README.md` with new architecture overview
- [ ] Update `CLAUDE.md` with tool-based patterns
- [ ] Create architecture decision record (ADR) for this change
- [ ] Update integration test documentation
- [ ] Add tool development guide for future tool additions

---

## Future Enhancements

### Post-Migration Opportunities

1. **Custom Tool SDK**: Create reusable tool definition framework
2. **Tool Composition**: Allow AI to compose complex tools from primitives
3. **Tool Analytics**: Dashboard showing tool usage patterns
4. **Smart Tool Selection**: AI learns which tools work best for which scenarios
5. **Multi-Agent Workflows**: Different AI agents with different tool access

---

## References

- [Anthropic Tool Use Documentation](https://docs.claude.com/en/docs/build-with-claude/tool-use)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [PRD Analysis Discussion](https://github.com/vfarcic/dot-ai/issues/136)
- Codebase: `src/tools/remediate.ts` (lines 204-304) - manual agentic loop example
- Codebase: `src/core/claude.ts` - existing AI integration

---

## Approval & Sign-off

**Approved by**: _Pending_
**Date**: _Pending_
**Decision**: _Pending review and discussion_

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-10-05 | **Major Update**: Aligned with PRD #73 multi-provider architecture. Updated solution to use AIProvider interface. Revised implementation to support Anthropic, OpenAI, and Google providers. Updated architecture diagrams, code examples, and milestones. | Claude Code |
| 2025-10-05 | Implementation started - Phase 1 (Foundation) | Claude Code |
| 2025-10-03 | Initial PRD created | Claude Code |
