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

/**
 * Input for mermaid validation tools
 */
export interface MermaidToolInput {
  diagram?: string;
}

/**
 * Result of mermaid validation
 */
interface MermaidValidationResult {
  success: boolean;
  valid?: boolean;
  error?: string | null;
  parseError?: {
    text?: string;
    token?: string;
    line?: number;
    loc?: unknown;
    expected?: string[];
  } | null;
  message: string;
}

/**
 * Mermaid parse error structure
 */
interface MermaidParseError extends Error {
  hash?: {
    text?: string;
    token?: string;
    line?: number;
    loc?: unknown;
    expected?: string[];
  };
}

// Initialize mermaid with strict validation
mermaid.initialize({
  securityLevel: 'strict',
  startOnLoad: false
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
  input: MermaidToolInput
): Promise<MermaidValidationResult> {
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
      error: 'Missing or invalid diagram parameter. Provide the Mermaid diagram code as a string.',
      message: 'Invalid input'
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
  } catch (error: unknown) {
    // Extract useful error information
    const mermaidError = error as MermaidParseError;
    const errorMessage = mermaidError.message || String(error);

    // Check if it's a parser error with detailed info
    const parseError = mermaidError.hash ? {
      text: mermaidError.hash.text,
      token: mermaidError.hash.token,
      line: mermaidError.hash.line,
      loc: mermaidError.hash.loc,
      expected: mermaidError.hash.expected
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
