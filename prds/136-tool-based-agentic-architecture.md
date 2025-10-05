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

### Critical Optimization: Scoped Tool Sets

**Problem**: Sending all tools to every workflow wastes context tokens.

**Solution**: Define workflow-specific tool sets and provide strategic guidance.

```typescript
// ❌ BAD: Send all tools to every workflow
const ALL_TOOLS = [
  kubectl_get, kubectl_describe, kubectl_logs, kubectl_events,
  search_capabilities, get_resource_schema, search_patterns,
  discover_operations
]; // 10 tools × 400 tokens = 4,000 tokens per call

// ✅ GOOD: Scoped tool sets per workflow
const REMEDIATE_TOOLS = [
  kubectl_get, kubectl_describe, kubectl_logs, kubectl_events
]; // 4 tools × 400 tokens = 1,600 tokens (60% reduction!)

const RECOMMEND_TOOLS = [
  search_capabilities, get_resource_schema, search_patterns
]; // 3 tools × 400 tokens = 1,200 tokens (70% reduction!)

const PLATFORM_TOOLS = [
  discover_operations, get_operation_parameters
]; // 2 tools × 400 tokens = 800 tokens (80% reduction!)

// Use scoped tools with minimal strategic guidance
await aiProvider.toolLoop({
  systemPrompt: `Investigate Kubernetes issue: ${issue}

  Available investigation tools:
  - kubectl_get: List resources of any type (pods, deployments, services, etc)
  - kubectl_describe: Get detailed information about specific resources
  - kubectl_logs: Retrieve container logs for debugging
  - kubectl_events: View cluster events for troubleshooting context

  Strategy: Start by identifying relevant resources, then drill into
  specifics. Use logs and events to understand failures.`,
  tools: REMEDIATE_TOOLS, // ✅ Only tools needed for this workflow
  toolExecutor: async (toolName, input) => executeKubectl(toolName, input)
});
```

**Token Savings Calculation (10-iteration investigation):**
- Without scoping: 4,000 tokens × 10 = 40,000 tokens
- With scoping: 1,600 tokens × 10 = 16,000 tokens
- **Savings: 24,000 tokens (60%) just from tool scoping!**
- Add minimal guidance: +100 tokens per iteration = +1,000 tokens
- **Net savings: 23,000 tokens (58%)**

**Design Principles:**
1. **Scoped tools** - Only include tools relevant to the workflow
2. **Informative descriptions** - Tool descriptions include "when to use" hints
3. **Strategic guidance** - 50-100 tokens suggesting approach (not step-by-step)
4. **Shared tools** - Common tools (like kubectl_get) can appear in multiple scopes

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

1. **90%+ Token Reduction**: Combined savings from:
   - AI fetches only needed data via tool calls (70-80% reduction)
   - Scoped tool sets per workflow (additional 50-60% reduction on tool schemas)
   - Total: ~95% reduction vs current prompt-based approach
2. **True Agentic Behavior**: Native AI loop vs manual iteration code
3. **Multi-Provider Support**: Works with Anthropic, OpenAI, Google
4. **Better Debugging**: Structured tool_use blocks with validation
5. **Scoped Context**: Each workflow only gets tools it needs
6. **Alignment with MCP**: Natural fit for Model Context Protocol architecture

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

### Phase 2: Platform Operations Conversion (Week 1) - START HERE

**Why first**: Smallest codebase (391 lines), fastest tests (~30s), lowest risk

**Target**: Convert `src/core/platform-operations.ts` to use tool-based approach

**Current Data Injections:**
1. `{helpOutput}` - Nu script help output (~2,000 tokens)
2. `{operations}` - JSON list of operations (~3,000 tokens)

#### Platform Tool Definitions (Scoped)

```typescript
// Scoped tool set for platform operations - ONLY 2 tools needed
export const PLATFORM_TOOLS: AITool[] = [
  {
    name: "discover_operations",
    description: `Discover available platform operations from Nu shell scripts.

    Use this to get the complete list of infrastructure tools and operations
    available for deployment (Argo CD, Crossplane, cert-manager, etc.).

    Returns: List of tools with their available operations and descriptions.`,
    inputSchema: {
      type: "object",
      properties: {} // No input needed
    }
  },
  {
    name: "get_operation_parameters",
    description: `Get detailed parameters for a specific platform operation.

    Use this after identifying the right operation to understand what
    parameters are required or optional for execution.

    Best practice: Call discover_operations first to see available operations.`,
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "Tool name (e.g., 'argocd', 'crossplane', 'cert-manager')"
        },
        operation: {
          type: "string",
          description: "Operation name (e.g., 'install', 'uninstall', 'status')"
        }
      },
      required: ["tool", "operation"]
    }
  }
];
```

#### Implementation Approach

Convert two functions in `platform-operations.ts`:

1. **`discoverOperations()` function**:
   ```typescript
   // Before: Parse help output with AI prompt injection
   const prompt = promptTemplate.replace('{helpOutput}', stdout);
   const response = await aiProvider.sendMessage(prompt);

   // After: AI calls discover_operations tool when needed
   const result = await aiProvider.toolLoop({
     systemPrompt: `Map user intent: "${intent}" to available platform operations.

     Available tools:
     - discover_operations: Get list of all platform tools and operations
     - get_operation_parameters: Get parameters for a specific operation

     Strategy: First discover operations, then match intent to the best operation.`,
     tools: PLATFORM_TOOLS,
     toolExecutor: async (toolName, input) => {
       if (toolName === 'discover_operations') {
         // Execute Nu script help and parse
         const { stdout } = await execNuScript(['help']);
         return parseOperationsFromHelp(stdout);
       }
       // ... handle other tools
     }
   });
   ```

2. **`mapIntentToOperation()` function**:
   - Remove `{operations}` injection (was ~3,000 tokens)
   - AI calls `discover_operations` only if needed
   - AI calls `get_operation_parameters` for specific details

**Token Savings:**
- Before: 5,000 tokens (helpOutput + operations) per call
- After: 800 tokens (2 tool schemas) + ~500 tokens (tool results when called)
- **Savings: 80-90% when AI doesn't need all operations**

#### Testing Strategy

- Use existing integration test: `tests/integration/tools/build-platform.test.ts`
- Test duration: ~30 seconds (fast!)
- Validate: "Install Argo CD" intent still maps correctly
- Measure: Token usage before/after

### Phase 3: Remediate Investigation (Week 2)

**Why second**: Biggest token savings (10,000+ tokens per investigation)

**Target**: Convert `src/tools/remediate.ts` investigation loop

**Current Data Injection:**
- `{clusterApiResources}` - kubectl api-resources output (~10,000 tokens)

#### Remediate Tool Definitions (Scoped)

```typescript
// Scoped tool set for remediation - ONLY 4 kubectl tools
export const REMEDIATE_TOOLS: AITool[] = [
  {
    name: "kubectl_get",
    description: `List Kubernetes resources of any type.

    Use this to discover what resources exist in the cluster, check their status,
    or find resources matching specific criteria. Essential first step in any
    investigation to understand the current state.

    Examples: Get failing pods, list deployments, check services.`,
    inputSchema: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          description: "Resource type: pods, deployments, services, nodes, etc."
        },
        namespace: {
          type: "string",
          description: "Namespace (optional, defaults to all namespaces)"
        },
        selector: {
          type: "string",
          description: "Label selector (optional, e.g., 'app=nginx')"
        }
      },
      required: ["resource"]
    }
  },
  {
    name: "kubectl_describe",
    description: `Get detailed information about a specific resource.

    Use this after identifying a problematic resource with kubectl_get.
    Provides events, conditions, configuration details, and relationships.

    Best practice: Call kubectl_get first to identify specific resources.`,
    inputSchema: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          description: "Resource type and name (e.g., 'pod/my-app-123', 'deployment/nginx')"
        },
        namespace: {
          type: "string",
          description: "Namespace where the resource exists"
        }
      },
      required: ["resource", "namespace"]
    }
  },
  {
    name: "kubectl_logs",
    description: `Get container logs from a pod.

    Use this when investigating application errors, crashes, or unexpected behavior.
    Essential for understanding what the application is doing at runtime.

    Best practice: Check pod status first. Use previous=true for CrashLooping pods.`,
    inputSchema: {
      type: "object",
      properties: {
        pod: {
          type: "string",
          description: "Pod name"
        },
        namespace: {
          type: "string",
          description: "Namespace containing the pod"
        },
        container: {
          type: "string",
          description: "Container name (optional, required for multi-container pods)"
        },
        previous: {
          type: "boolean",
          description: "Get logs from previous container instance (for crashed containers)"
        }
      },
      required: ["pod", "namespace"]
    }
  },
  {
    name: "kubectl_events",
    description: `View cluster events for troubleshooting context.

    Use this to understand recent cluster activity, scheduling failures, resource
    issues, or any warnings. Provides timeline context for failures.

    Strategy: Use fieldSelector to filter events for specific resources.`,
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: "Namespace filter (optional)"
        },
        fieldSelector: {
          type: "string",
          description: "Field selector (e.g., 'involvedObject.name=my-pod')"
        }
      }
    }
  }
];
```

#### Implementation Approach

Replace manual 20-iteration loop (lines 204-304 in remediate.ts):

```typescript
// Before: Manual iteration with massive data injection
let clusterApiResources = await executeKubectl(['api-resources']); // 10,000 tokens!
const investigationPrompt = promptTemplate
  .replace('{clusterApiResources}', clusterApiResources);

for (let i = 0; i < 20; i++) {
  const response = await aiProvider.sendMessage(investigationPrompt);
  // 400+ lines of manual loop management...
}

// After: Tool-based agentic loop with scoped tools
const result = await aiProvider.toolLoop({
  systemPrompt: `Investigate Kubernetes issue: ${session.issue}

  Available investigation tools:
  - kubectl_get: List resources of any type (pods, deployments, services, etc)
  - kubectl_describe: Get detailed information about specific resources
  - kubectl_logs: Retrieve container logs for debugging
  - kubectl_events: View cluster events for troubleshooting context

  Strategy: Start by identifying relevant resources, then drill into
  specifics. Use logs and events to understand failures. Call tools as
  many times as needed to complete the investigation.`,
  tools: REMEDIATE_TOOLS, // Only 4 tools (1,600 tokens vs 10,000!)
  toolExecutor: async (toolName, input) => {
    return await gatherSafeData({ operation: toolName, ...input });
  },
  maxIterations: 20
});
```

**Token Savings:**
- Before: 10,000 tokens (clusterApiResources) × 20 iterations = 200,000 tokens
- After: 1,600 tokens (4 tool schemas) × 20 iterations = 32,000 tokens
- **Savings: 168,000 tokens (84%) per investigation!**

#### Code Removal

Delete lines 204-304 in remediate.ts (manual agentic loop)

### Phase 4: Capability Search & Recommendations (Weeks 3-4)

**Target**: Convert `src/core/schema.ts` capability search

**Current Data Injections:**
- `{resources}` - Pre-fetched 50 capabilities (~5,000 tokens)
- `{patterns}` - Organizational patterns (~2,000 tokens)

#### Recommendation Tool Definitions (Scoped)

```typescript
// Scoped tool set for recommendations - 3 tools
export const RECOMMEND_TOOLS: AITool[] = [
  {
    name: "search_capabilities",
    description: `Search cluster capabilities by intent or keywords.

    Use this to find Kubernetes resources (CRDs, operators, etc.) available
    in the cluster that match the user's deployment intent.

    Strategy: Start with broad search, then refine with more specific queries.`,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (keywords, intent, resource types)"
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 10)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_resource_schema",
    description: `Get detailed schema for a specific Kubernetes resource.

    Use this after identifying relevant resources to understand their
    configuration options, required fields, and capabilities.

    Best practice: Call search_capabilities first to find candidates.`,
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          description: "Resource kind (e.g., 'Deployment', 'Database', 'Certificate')"
        },
        apiVersion: {
          type: "string",
          description: "API version (e.g., 'apps/v1', 'postgres.k8s.io/v1')"
        }
      },
      required: ["kind", "apiVersion"]
    }
  },
  {
    name: "search_patterns",
    description: `Search organizational patterns relevant to deployment intent.

    Use this to find established best practices and templates that match
    the user's requirements (databases, APIs, caching, messaging, etc.).

    Strategy: Search after understanding intent to enhance recommendations.`,
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "User's deployment intent or requirement keywords"
        },
        limit: {
          type: "number",
          description: "Max patterns to return (default: 5)"
        }
      },
      required: ["intent"]
    }
  }
];
```

#### Implementation Changes

Replace pre-fetching in schema.ts:

```typescript
// Before: Pre-fetch all capabilities (lines ~620-625)
const capabilities = await discovery.searchCapabilities('*'); // Get ALL 50+ capabilities
const resourcesText = capabilities.map(c => JSON.stringify(c)).join('\n'); // 5,000 tokens!
const prompt = template.replace('{resources}', resourcesText);

// After: Let AI search dynamically
const result = await aiProvider.toolLoop({
  systemPrompt: `Recommend Kubernetes resources for intent: "${intent}"

  Available tools:
  - search_capabilities: Find cluster resources matching keywords/intent
  - get_resource_schema: Get detailed schema for specific resources
  - search_patterns: Find organizational patterns for best practices

  Strategy: Search capabilities broadly first, then get schemas for top
  candidates. Use patterns to enhance recommendations with best practices.`,
  tools: RECOMMEND_TOOLS, // Only 3 tools (1,200 tokens vs 7,000!)
  toolExecutor: async (toolName, input) => {
    if (toolName === 'search_capabilities') {
      return await discovery.searchCapabilities(input.query, input.limit);
    }
    // ... other tools
  }
});
```

**Token Savings:**
- Before: 7,000 tokens (resources + patterns) per recommendation
- After: 1,200 tokens (3 tool schemas) + ~2,000 tokens (search results when called)
- **Savings: 3,800 tokens (54%) per recommendation**

---

## Implementation Plan

### Milestones (Data-Source-First Approach)

- [x] **Milestone 1: AIProvider Interface Extension (Days 1-2)** ✅ **COMPLETE**
  - [x] Extend `AIProvider` interface with tool use methods (`toolLoop`, `sendMessageWithTools`)
  - [x] Add new types: `AITool`, `ToolExecutor`, `ToolLoopConfig`, `AgenticResult`
  - [x] Implement `toolLoop()` in `AnthropicProvider` using Anthropic SDK
  - [~] Implement `toolLoop()` in `VercelProvider` using Vercel AI SDK (deferred - will implement after Anthropic validation)
  - [~] Write unit tests for both provider implementations (N/A - project uses integration tests only)
  - [x] **Metrics logging infrastructure** - Created shared `provider-debug-utils.ts`, eliminated ~140 lines of duplication
  - [x] **Operation name tracking** - Added specific operation names to platform operations for metrics identification
  - [x] **Baseline metrics capture** - Captured pre-migration token usage (discover: 1,633 tokens, map: 3,030 tokens)
  - [~] Define scoped tool set constants (`PLATFORM_TOOLS`, `REMEDIATE_TOOLS`, `RECOMMEND_TOOLS`) (moved to Milestone 2)

- [ ] **Milestone 2: Platform Operations Migration (Days 3-4)** 🎯 **START HERE**
  - Define 2 platform tools with informative descriptions
  - Convert `discoverOperations()` to use `toolLoop()` with PLATFORM_TOOLS
  - Convert `mapIntentToOperation()` to use tool-based approach
  - Remove `{helpOutput}` and `{operations}` injections from prompts
  - Add strategic guidance to system prompts (~50-100 tokens)
  - Test with existing integration test (30s duration)
  - **Token savings validation**: Measure 80-90% reduction

- [ ] **Milestone 3: Remediate Investigation Migration (Days 5-10)**
  - Define 4 kubectl tools with "when to use" guidance
  - Convert investigation loop in `remediate.ts` to use REMEDIATE_TOOLS
  - Remove lines 204-304 (manual agentic loop)
  - Remove `{clusterApiResources}` injection (10,000 tokens!)
  - Add strategic guidance to investigation prompt
  - Add feature flag: `ENABLE_TOOL_BASED_REMEDIATION`
  - Write integration tests comparing tool-based vs prompt-based
  - **Token savings validation**: Measure 84% reduction (168,000 tokens per investigation)

- [ ] **Milestone 4: Multi-Provider Testing & Validation (Days 11-15)**
  - A/B test tool-based vs prompt-based with Anthropic
  - Test platform operations with OpenAI (via VercelProvider)
  - Test remediation with Google Gemini (via VercelProvider)
  - Measure token usage, latency, accuracy across all providers
  - Document performance differences and provider-specific behavior
  - Validate scoped tools approach across different AI models
  - Gather internal feedback and adjust tool descriptions if needed

- [ ] **Milestone 5: Capability Search Migration (Days 16-25)**
  - Define 3 recommendation tools with scoped focus
  - Convert `schema.ts` capability search to use RECOMMEND_TOOLS
  - Remove pre-fetching of 50 capabilities from `recommend.ts`
  - Remove `{resources}` and `{patterns}` injections
  - Add strategic guidance for recommendation workflow
  - Integration tests for recommendation quality across providers
  - **Token savings validation**: Measure 54% reduction (3,800 tokens per recommendation)

- [ ] **Milestone 6: Production Rollout & Documentation (Days 26-30)**
  - Remove feature flags after validation (if all metrics green)
  - Remove legacy prompt-based code paths
  - Update CLAUDE.md with scoped tool patterns and strategic guidance examples
  - Create tool development guide for future additions
  - Document multi-provider tool use best practices
  - Update PRD status to "Complete"
  - Announce architecture change to users with token savings metrics

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
- **Token Reduction**: ≥80% reduction in average input tokens (combined: tool-based + scoped tools)
  - Platform operations: 80-90% reduction
  - Remediate investigation: 84% reduction (168,000 tokens saved per investigation)
  - Capability search: 54% reduction (3,800 tokens saved per recommendation)
- **Code Complexity**: ≥30% reduction in cyclomatic complexity (400+ lines removed from remediate.ts)
- **Reliability**: Zero increase in error rates across all providers
- **Performance**: Latency improvement or ≤10% regression acceptable
- **Multi-Provider**: Tool use works consistently across Anthropic, OpenAI, and Google

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

## Measurement & Validation Strategy

### Baseline Metrics Capture

**Decision (2025-10-05)**: Use simple append-only metrics logging instead of complex instrumentation framework.

**Rationale**:
- Leverage existing `DEBUG_DOT_AI` flag and debug infrastructure
- Minimal code changes (10 lines total across both providers)
- JSONL format enables standard tooling (`jq`, `awk`) for analysis
- Works automatically with existing integration tests

**Implementation Approach**:

```typescript
// Add to AnthropicProvider and VercelProvider
private logMetrics(operation: string, usage: any, durationMs: number): void {
  if (!this.debugMode) return;

  const metricsFile = path.join(process.cwd(), 'tmp', 'debug-ai', 'metrics.jsonl');
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    provider: this.getProviderType(),
    operation,
    inputTokens: usage.input_tokens || usage.promptTokens,
    outputTokens: usage.output_tokens || usage.completionTokens,
    durationMs
  }) + '\n';

  fs.appendFileSync(metricsFile, entry);
}

// Call from sendMessage()
if (this.debugMode) {
  this.logMetrics(operation, result.usage, Date.now() - startTime);
}
```

**Baseline Capture Process**:

1. Add operation names to key call sites:
   - `remediate.ts`: `'remediate-investigation'`, `'remediate-analysis'`
   - `platform-operations.ts`: `'platform-discover-operations'`, `'platform-map-intent'`
   - `schema.ts`: Already has operation names

2. Run baseline tests:
   ```bash
   DEBUG_DOT_AI=true npm run test:integration
   cp tmp/debug-ai/metrics.jsonl tmp/baseline-metrics.jsonl
   ```

3. Analyze with `jq`:
   ```bash
   cat tmp/baseline-metrics.jsonl | jq -s '
     group_by(.operation) |
     map({
       operation: .[0].operation,
       calls: length,
       avgInputTokens: (map(.inputTokens) | add / length | floor),
       totalInputTokens: (map(.inputTokens) | add),
       avgOutputTokens: (map(.outputTokens) | add / length | floor),
       avgDurationMs: (map(.durationMs) | add / length | floor)
     })
   '
   ```

**Comparison Process**:

After implementing tool-based approach:
1. Run same integration tests with `DEBUG_DOT_AI=true`
2. Compare `tmp/debug-ai/metrics.jsonl` vs `tmp/baseline-metrics.jsonl`
3. Validate token reduction claims (target: 80-95%)
4. Document actual results in PRD

**Success Validation**:
- ✅ Token reduction ≥80% (combined data injection elimination + scoped tools)
- ✅ No quality regression (integration tests pass rate unchanged)
- ✅ Acceptable latency (≤10% slower is acceptable)
- ✅ Multi-provider consistency (works across Anthropic, OpenAI, Google)

## Open Questions

1. **Tool Call Limits**: Should we limit max tool calls per investigation? (Prevent runaway costs)
2. **Caching Strategy**: How to cache tool results across similar investigations?
3. **Parallel Tool Calls**: When should we allow Claude to call tools in parallel vs sequential?
4. **Error Recovery**: How should AI recover from multiple consecutive tool failures?

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

## Work Log

### 2025-01-05: Milestone 1 Progress - AIProvider Tool Use Foundation (Anthropic)
**Duration**: ~4-6 hours
**Files Modified**: 3 files, +383 lines
**Primary Focus**: Tool use interface and Anthropic-first implementation

**Completed PRD Items**:
- [x] AIProvider interface extended with tool use types and methods (src/core/ai-provider.interface.ts)
- [x] AnthropicProvider toolLoop() fully implemented with native Anthropic SDK (src/core/providers/anthropic-provider.ts)
- [x] VercelProvider stub created with placeholder implementation (src/core/providers/vercel-provider.ts)

**Implementation Details**:
- **Interface**: Added `AITool`, `ToolExecutor`, `ToolLoopConfig`, `AgenticResult` types
- **Methods**: Added `toolLoop()` and `sendMessageWithTools()` to AIProvider interface
- **AnthropicProvider**: Full agentic loop with tool execution, error handling (feeds errors back to AI), token tracking, conversation history management, max iterations safety
- **VercelProvider**: Placeholder throws informative error directing users to AnthropicProvider for now

**Strategy Decision**:
- Anthropic-first approach: Validate tool-based architecture with real workflows before implementing VercelProvider
- Integration tests will validate functionality when workflows migrate (project uses integration tests, not unit tests)
- Lower risk: Prove approach works before expanding to multiple providers

**Next Session Priorities**:
- Begin Milestone 2: Platform Operations Migration (smallest codebase, fastest tests)
- Define PLATFORM_TOOLS constants in code
- Convert platform-operations.ts to use AnthropicProvider.toolLoop()
- Validate 80-90% token savings claim with actual measurements

### 2025-10-05: Milestone 1 Complete - Metrics Infrastructure & Baseline Capture
**Duration**: ~2-3 hours
**Files Modified**: 4 files (+111 lines, -170 duplicated lines removed)
**Primary Focus**: Metrics logging infrastructure and baseline token usage capture

**Completed PRD Items**:
- [x] Metrics logging infrastructure - Created `src/core/providers/provider-debug-utils.ts` with shared utilities
- [x] Operation name tracking - Updated `src/core/platform-operations.ts` with specific operation names
- [x] Baseline metrics capture - Captured pre-migration token usage for comparison

**Implementation Details**:
- **Shared Debug Utils**: Created `provider-debug-utils.ts` with `logMetrics()`, `debugLogInteraction()`, utilities
  - Eliminated ~140 lines of duplicate code between AnthropicProvider and VercelProvider
  - Appends to `./tmp/debug-ai/metrics.jsonl` with operation name, provider, tokens, duration
  - Works with existing `DEBUG_DOT_AI=true` flag
- **Operation Tracking**: Updated platform operations to pass specific operation names to `sendMessage()`
  - `platform-discover-operations`: Line 107 in platform-operations.ts
  - `platform-map-intent`: Line 144 in platform-operations.ts
- **Baseline Metrics**: Captured pre-migration token usage through integration tests
  - `platform-discover-operations`: 1,633 input tokens average (6 calls)
  - `platform-map-intent`: 3,030 input tokens average (5 calls)
  - Saved to `tmp/baseline-metrics-prompt-based.jsonl` for comparison

**Testing & Validation**:
- All 6 integration tests pass with metrics collection enabled
- Metrics properly captured in JSONL format
- Analysis with `jq` confirms proper operation categorization

**Next Session Priorities**:
- **Milestone 2 Ready**: Infrastructure complete, ready to start platform operations migration
- Define PLATFORM_TOOLS constants (2 tools: `discover_operations`, `get_operation_parameters`)
- Convert `discoverOperations()` and `mapIntentToOperation()` to use `toolLoop()`
- Compare metrics after migration to validate 80-90% token reduction claim

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-10-05 | **Measurement Strategy**: Added simple metrics logging decision. Instead of complex instrumentation framework, use append-only JSONL logging in providers (10 lines of code). Leverage existing `DEBUG_DOT_AI` flag. Enables baseline capture with standard tooling (`jq`) and automatic metrics from integration tests. Added baseline capture process, comparison workflow, and success validation criteria. | Claude Code |
| 2025-10-05 | **Critical Optimization Update**: Added scoped tool sets per workflow (60-80% token reduction on tool schemas). Added strategic guidance patterns (50-100 tokens vs prescriptive instructions). Restructured implementation to data-source-first approach starting with platform operations (fastest/lowest risk). Updated all phases with detailed tool definitions, token savings calculations, and informative descriptions. Changed milestones to 6 sprints (30 days) with platform operations as first implementation target. Updated success metrics to reflect 80%+ combined token reduction. | Claude Code |
| 2025-10-05 | **Major Update**: Aligned with PRD #73 multi-provider architecture. Updated solution to use AIProvider interface. Revised implementation to support Anthropic, OpenAI, and Google providers. Updated architecture diagrams, code examples, and milestones. | Claude Code |
| 2025-10-05 | Implementation started - Phase 1 (Foundation) | Claude Code |
| 2025-10-03 | Initial PRD created | Claude Code |
