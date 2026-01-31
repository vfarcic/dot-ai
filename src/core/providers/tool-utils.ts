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
 * Tool call structure
 */
interface ToolCall {
  tool: string;
  [key: string]: unknown;
}

/**
 * Formats a tool execution result for inclusion in conversation history.
 */
export function formatToolOutput(toolName: string, output: unknown): string {
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
export function extractToolCalls(content: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  const matches = [...content.matchAll(TOOL_CALL_REGEX)];

  if (matches.length > 0) {
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
      } catch {
        // Ignore parse errors
      }
    }
  } else {
    // Fallback: Try to find a JSON object in the content if no code blocks found
    try {
      const firstBrace = content.indexOf('{');
      if (firstBrace !== -1) {
        // Simple brace counting to find the end of the JSON object
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;
        let jsonEndIndex = -1;

        for (let i = firstBrace; i < content.length; i++) {
          const char = content[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (inString) continue;

          if (char === '{') braceCount++;
          if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEndIndex = i + 1;
              break;
            }
          }
        }

        if (jsonEndIndex !== -1) {
          const jsonString = content.substring(firstBrace, jsonEndIndex);
          const parsed = JSON.parse(jsonString);

          if (parsed && typeof parsed === 'object' && parsed.tool) {
            toolCalls.push(parsed);
          }
        }
      }
    } catch {
      // Ignore fallback errors
    }
  }
  return toolCalls;
}
