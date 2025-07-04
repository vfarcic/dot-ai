# Function Registration System

## Overview

The DevOps AI Toolkit implements a dynamic function registration system that allows MCP tools to be registered, discovered, and executed through a centralized registry. This system replaces the previous hardcoded approach with a flexible, extensible architecture.

## Architecture

### Core Components

1. **ToolRegistry** (`src/core/tool-registry.ts`)
   - Central registry for all MCP tools
   - Handles registration, validation, discovery, and execution
   - Provides comprehensive statistics and management capabilities

2. **Tool Interfaces** (`src/core/tool-registry.ts`)
   - `ToolDefinition`: Schema and metadata for tools
   - `ToolHandler`: Function interface for tool execution
   - `ToolContext`: Runtime context passed to tools
   - `ToolRegistration`: Internal registry representation

3. **Tool Modules** (`src/tools/`)
   - Individual tool implementations
   - Separated definition and handler exports
   - Self-contained with proper error handling

## Usage Patterns

### Basic Tool Registration

```typescript
import { ToolRegistry } from '../core/tool-registry';

const registry = new ToolRegistry({
  logger: myLogger,
  enabledByDefault: true,
  validateSchemas: true
});

// Register a tool
registry.registerTool(toolDefinition, toolHandler);

// Check availability
if (registry.isToolAvailable('my_tool')) {
  const result = await registry.executeTool('my_tool', args, context);
}
```

### Tool Definition Structure

```typescript
const toolDefinition: ToolDefinition = {
  name: 'recommend',
  description: 'Generate deployment recommendations',
  inputSchema: {
    type: 'object',
    properties: {
      intent: { 
        type: 'string',
        description: 'Deployment intent',
        minLength: 1,
        maxLength: 1000
      }
    },
    required: ['intent']
  },
  outputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['text'] },
            text: { type: 'string', minLength: 1 }
          },
          required: ['type', 'text']
        }
      }
    },
    required: ['content']
  },
  version: '1.0.0',
  category: 'analysis',
  tags: ['deployment', 'recommendation']
};
```

### Tool Handler Implementation

```typescript
const toolHandler: ToolHandler = async (args: any, context: ToolContext) => {
  try {
    // Validate input
    SchemaValidator.validateToolInput('recommend', args, toolDefinition.inputSchema);
    
    // Execute tool logic
    const result = await performRecommendation(args.intent, context);
    
    // Validate output
    SchemaValidator.validateToolOutput('recommend', result, toolDefinition.outputSchema!);
    
    return result;
  } catch (error) {
    context.logger.error(`Tool execution failed: recommend`, error);
    throw error;
  }
};
```

### Modular Tool Structure

Each tool should be implemented as a separate module:

```
src/tools/
├── index.ts              # Central registration
├── recommend.ts          # Recommendation tool
├── enhance-solution.ts   # Solution enhancement tool
└── new-tool.ts          # Future tools
```

Tool module pattern:
```typescript
// src/tools/my-tool.ts
export const myToolDefinition: ToolDefinition = { /* ... */ };
export const myToolHandler: ToolHandler = async (args, context) => { /* ... */ };

// src/tools/index.ts
import { myToolDefinition, myToolHandler } from './my-tool';

export function registerAllTools(registry: ToolRegistry): void {
  registry.registerTool(myToolDefinition, myToolHandler);
  // Register other tools...
}
```

## Integration with MCP Server

The registry integrates seamlessly with the MCP server:

```typescript
// src/interfaces/mcp.ts
export class MCPServer {
  private toolRegistry: ToolRegistry;

  constructor(dotAI: DotAI, serverInfo: ServerInfo) {
    this.toolRegistry = new ToolRegistry({
      logger: new ConsoleLogger('ToolRegistry'),
      enabledByDefault: true,
      validateSchemas: true
    });
    
    // Initialize tools
    initializeTools(this.toolRegistry);
  }

  async handleCallTool(request: CallToolRequest): Promise<CallToolResult> {
    const { name, arguments: args } = request.params;
    
    const toolContext: ToolContext = {
      requestId: generateRequestId(),
      logger: this.logger,
      dotAI: this.dotAI
    };

    // Dynamic tool dispatch through registry
    return await this.toolRegistry.executeTool(name, args, toolContext);
  }

  async handleListTools(): Promise<ListToolsResult> {
    return {
      tools: this.toolRegistry.getToolDefinitions()
    };
  }
}
```

## Error Handling

The registry integrates with the DevOps AI Toolkit error handling system:

```typescript
// Automatic error wrapping and logging
try {
  const result = await registry.executeTool(name, args, context);
  return result;
} catch (error) {
  // Registry automatically logs errors and provides context
  // Error is propagated with enhanced information
  throw error;
}
```

## Validation

Input and output validation is handled automatically:

```typescript
// Input validation before execution
SchemaValidator.validateToolInput(toolName, args, inputSchema);

// Output validation after execution
SchemaValidator.validateToolOutput(toolName, result, outputSchema);
```

## Registry Management

### Tool Lifecycle

```typescript
// Enable/disable tools at runtime
registry.setToolEnabled('my_tool', false);

// Check tool status
const isAvailable = registry.isToolAvailable('my_tool');

// Get tool information
const tool = registry.getTool('my_tool');

// Unregister tools
registry.unregisterTool('my_tool');
```

### Statistics and Monitoring

```typescript
const stats = registry.getStats();
// Returns:
// {
//   totalTools: 3,
//   enabledTools: 2,
//   disabledTools: 1,
//   categories: { analysis: 2, utility: 1 }
// }
```

## Best Practices

### Tool Design

1. **Single Responsibility**: Each tool should have a clear, focused purpose
2. **Schema Validation**: Always provide comprehensive input/output schemas
3. **Error Handling**: Use proper error handling with context logging
4. **Documentation**: Include clear descriptions and examples

### Registry Usage

1. **Centralized Registration**: Use `src/tools/index.ts` for all tool registration
2. **Lazy Loading**: Tools are registered at startup, not dynamically loaded
3. **Validation**: Enable schema validation in production environments
4. **Monitoring**: Use registry statistics for monitoring and debugging

### Testing

1. **Unit Tests**: Test tool handlers independently
2. **Integration Tests**: Test through registry execution
3. **Schema Tests**: Validate schemas are properly defined
4. **Error Tests**: Test error handling and edge cases

## Migration from Hardcoded System

The dynamic registration system maintains backward compatibility while providing these improvements:

### Before (Hardcoded)
```typescript
// Static tool list
private setupToolHandlers(): Tool[] {
  return [
    { name: 'recommend', description: '...' },
    { name: 'enhance_solution', description: '...' }
  ];
}

// Switch-based dispatch
switch (name) {
  case 'recommend':
    return await this.handleRecommend(args);
  case 'enhance_solution':
    return await this.handleEnhanceSolution(args);
}
```

### After (Dynamic Registry)
```typescript
// Dynamic tool discovery
async handleListTools(): Promise<ListToolsResult> {
  return { tools: this.toolRegistry.getToolDefinitions() };
}

// Registry-based dispatch
async handleCallTool(request: CallToolRequest): Promise<CallToolResult> {
  return await this.toolRegistry.executeTool(name, args, context);
}
```

## Future Extensions

The registry system supports:

1. **Plugin Architecture**: Tools can be loaded from external modules
2. **Runtime Registration**: Tools can be registered/unregistered dynamically
3. **Conditional Tools**: Tools can be enabled based on environment or configuration
4. **Tool Versioning**: Multiple versions of tools can coexist
5. **Resource Management**: Tools can declare resource requirements

## Configuration

Registry configuration options:

```typescript
interface ToolRegistryOptions {
  logger?: Logger;                  // Custom logger implementation
  enabledByDefault?: boolean;       // Default enabled state for new tools
  validateSchemas?: boolean;        // Enable/disable schema validation
  maxConcurrentExecutions?: number; // Limit concurrent tool executions
}
```

## Troubleshooting

Common issues and solutions:

### Tool Not Found
- Verify tool is registered in `src/tools/index.ts`
- Check tool name matches exactly (case-sensitive)
- Ensure `initializeTools()` is called during startup

### Schema Validation Errors
- Verify input/output schemas are valid JSON Schema
- Check required fields are properly defined
- Ensure data types match schema definitions

### Tool Execution Failures
- Check tool handler implementation for errors
- Verify context is properly passed to tool
- Review error logs for specific failure details

### Performance Issues
- Monitor registry statistics for tool usage patterns
- Consider disabling unused tools
- Review tool handler efficiency

---

*This documentation provides a comprehensive guide to the DevOps AI Toolkit function registration system, enabling developers to understand, use, and extend the dynamic tool architecture.*