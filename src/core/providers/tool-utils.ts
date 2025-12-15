import { AITool } from '../ai-provider.interface';

/**
 * Formats tool definitions into a markdown string for system prompts.
 * Used by providers that don't support native tool calling or need manual prompting.
 */
export function formatToolDefinitions(tools: AITool[]): string {
  let toolDefinitions = '';
  for (const tool of tools) {
    toolDefinitions += `### ${tool.name}\n${tool.description}\n`;
    toolDefinitions += `Schema: ${JSON.stringify(tool.inputSchema)}\n\n`;
  }
  return toolDefinitions;
}

/**
 * Formats a tool execution result for inclusion in conversation history.
 */
export function formatToolOutput(toolName: string, output: any): string {
  return `Tool '${toolName}' output:\n${JSON.stringify(output, null, 2)}`;
}

/**
 * Regex for extracting tool calls from markdown code blocks.
 * Matches: ```json { "tool": "name", ... } ```
 */
export const TOOL_CALL_REGEX = /```json\s*({[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?})\s*```/g;
