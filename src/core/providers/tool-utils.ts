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
 * Matches: ```json ... ``` and captures the content.
 */
export const TOOL_CALL_REGEX = /```json\s*([\s\S]*?)\s*```/g;

/**
 * Extracts tool calls from a string containing markdown code blocks.
 * Handles nested objects and malformed JSON gracefully.
 */
export function extractToolCalls(content: string): any[] {
  const toolCalls: any[] = [];
  const matches = [...content.matchAll(TOOL_CALL_REGEX)];

  for (const match of matches) {
    try {
      const jsonContent = match[1];
      const parsed = JSON.parse(jsonContent);

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && item.tool) {
            toolCalls.push(item);
          }
        }
      } else if (parsed && typeof parsed === 'object' && parsed.tool) {
        toolCalls.push(parsed);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
  return toolCalls;
}
