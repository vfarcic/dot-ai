# MCP Tool Architecture

## Overview

The DevOps AI Toolkit implements a clean, direct MCP tool architecture using the official MCP SDK patterns. Tools are registered directly with the MCP server using `McpServer.tool()` method, providing type safety and simplicity.

## Architecture

### Core Components

1. **Direct Tool Handlers** (`src/tools/`)
   - Direct handler functions (e.g., `handleRecommendTool`)
   - Tool metadata constants (e.g., `RECOMMEND_TOOL_NAME`, `RECOMMEND_TOOL_DESCRIPTION`)
   - Zod schemas for MCP registration and validation

2. **MCP Server Integration** (`src/interfaces/mcp.ts`)
   - Uses `McpServer.tool()` for direct tool registration
   - No custom registry abstractions
   - Follows official MCP SDK patterns

3. **Session Management** (`src/core/session-utils.ts`)
   - Environment-based configuration using `DOT_AI_SESSION_DIR`
   - Consistent session directory resolution across all tools

## Tool Structure

### Tool Module Pattern

Each tool exports:

```typescript
// Tool metadata
export const RECOMMEND_TOOL_NAME = 'recommend';
export const RECOMMEND_TOOL_DESCRIPTION = 'Deploy, create, run, or setup applications on Kubernetes with AI-powered recommendations';

// Zod schema for MCP validation
export const RECOMMEND_TOOL_INPUT_SCHEMA = {
  intent: z.string().min(1).max(1000).describe('What the user wants to deploy...')
};

// Direct handler function
export async function handleRecommendTool(
  args: { intent: string },
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  // Tool implementation
}
```

### MCP Registration

Tools are registered directly with the MCP server:

```typescript
// src/interfaces/mcp.ts
this.server.tool(
  RECOMMEND_TOOL_NAME,
  RECOMMEND_TOOL_DESCRIPTION,
  RECOMMEND_TOOL_INPUT_SCHEMA,
  async (args: any) => {
    const requestId = this.generateRequestId();
    return await handleRecommendTool(args, this.dotAI, this.logger, requestId);
  }
);
```

## Available Tools

1. **recommend** - AI-powered deployment recommendations
2. **chooseSolution** - Select a solution and return configuration questions
3. **answerQuestion** - Process user answers and manage configuration stages
4. **generateManifests** - Generate Kubernetes manifests from completed solutions
5. **deployManifests** - Deploy manifests with readiness checking

## Configuration

### Environment Variables

- `DOT_AI_SESSION_DIR` - Directory for storing solution files
- `ANTHROPIC_API_KEY` - Required for AI-powered features

### CLI Parameters

- `--session-dir <path>` - Override session directory (takes precedence over env var)
- `--kubeconfig <path>` - Custom kubeconfig path

## Usage Patterns

### MCP Mode
Tools automatically use `DOT_AI_SESSION_DIR` environment variable:

```bash
export DOT_AI_SESSION_DIR=/path/to/sessions
# Tools will automatically use this directory
```

### CLI Mode
CLI sets the environment variable before calling tools:

```bash
dot-ai recommend --intent "deploy a web app" --session-dir /custom/path
```

## Error Handling

All tools use the unified error handling system:

```typescript
return await ErrorHandler.withErrorHandling(
  async () => {
    // Tool logic
  },
  {
    operation: 'tool_operation',
    component: 'ToolName',
    requestId,
    input: args
  }
);
```

## Testing

Tests use direct handler functions:

```typescript
const result = await handleRecommendTool(
  { intent: 'deploy web app' },
  mockDotAI,
  mockLogger,
  'test-request-id'
);
```

## Best Practices

1. **Type Safety**: Use TypeScript interfaces for tool arguments
2. **Schema Validation**: Define comprehensive Zod schemas
3. **Error Context**: Provide detailed error context and suggested actions
4. **Environment Config**: Use environment variables for session management
5. **Direct Handlers**: Keep tools as pure functions without registry abstractions

## Migration Benefits

The new architecture provides:

- **Simplicity**: No custom registry abstractions
- **Type Safety**: Direct TypeScript types, no `any` types
- **Official Patterns**: Uses MCP SDK best practices
- **Better Testing**: Tests verify actual functionality, not abstractions
- **Reduced Complexity**: Eliminated 400+ lines of registry code

---

*This architecture provides a clean, maintainable foundation for MCP tool development using official SDK patterns.*