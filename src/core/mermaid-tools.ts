/**
 * Mermaid Validation Tools for AI-Powered Visualization
 *
 * Provides Mermaid diagram validation tools for the visualization AI.
 * Allows AI to validate diagrams before returning them to the user.
 *
 * PRD #320: Milestone 2.6 - Mermaid Diagram Validation
 */

import { AITool } from './ai-provider.interface';
import mermaid from 'mermaid';

// Initialize mermaid with strict validation
mermaid.initialize({
  securityLevel: 'strict',
  startOnLoad: false,
  // Disable rendering, we only want parsing/validation
  suppressErrorRendering: true
});

/**
 * Tool: validate_mermaid
 * Validates Mermaid diagram syntax and returns errors if any
 */
export const VALIDATE_MERMAID_TOOL: AITool = {
  name: 'validate_mermaid',
  description: `Validates Mermaid diagram syntax. Use this tool to check if a Mermaid diagram has correct syntax BEFORE including it in visualizations.

IMPORTANT: Always validate all Mermaid diagrams before returning them. If validation fails, fix the error and validate again.

Common Mermaid syntax errors to watch for:
- "classDist" should be "classDef" (class definition)
- Missing quotes around labels with special characters
- Invalid node/edge syntax
- Unbalanced brackets or parentheses

Returns:
- valid: boolean - true if diagram is valid
- error: string | null - error message if invalid, null if valid
- parseError: object | null - detailed parse error info if available`,
  inputSchema: {
    type: 'object',
    properties: {
      diagram: {
        type: 'string',
        description: 'The Mermaid diagram code to validate (without the ```mermaid code fence)'
      }
    },
    required: ['diagram']
  }
};

/**
 * All mermaid tools for visualization
 */
export const MERMAID_TOOLS: AITool[] = [
  VALIDATE_MERMAID_TOOL
];

/**
 * Execute Mermaid-related tools
 *
 * @param toolName - Name of the tool to execute
 * @param input - Tool input parameters
 * @returns Tool execution result
 */
export async function executeMermaidTools(
  toolName: string,
  input: any
): Promise<any> {
  if (toolName !== 'validate_mermaid') {
    return {
      success: false,
      error: `Unknown mermaid tool: ${toolName}`,
      message: `Tool '${toolName}' is not a mermaid tool`
    };
  }

  const { diagram } = input;

  if (!diagram || typeof diagram !== 'string') {
    return {
      success: false,
      valid: false,
      error: 'Missing or invalid diagram parameter. Provide the Mermaid diagram code as a string.'
    };
  }

  try {
    // Use mermaid.parse() to validate syntax without rendering
    // This returns true if valid, or throws an error if invalid
    await mermaid.parse(diagram);

    return {
      success: true,
      valid: true,
      error: null,
      parseError: null,
      message: 'Diagram syntax is valid'
    };
  } catch (error: any) {
    // Extract useful error information
    const errorMessage = error.message || String(error);

    // Check if it's a parser error with detailed info
    const parseError = error.hash ? {
      text: error.hash.text,
      token: error.hash.token,
      line: error.hash.line,
      loc: error.hash.loc,
      expected: error.hash.expected
    } : null;

    return {
      success: true, // Tool executed successfully, but diagram is invalid
      valid: false,
      error: errorMessage,
      parseError,
      message: `Diagram validation failed: ${errorMessage}`
    };
  }
}
