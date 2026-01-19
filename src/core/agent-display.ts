/**
 * Agent Display Utilities
 *
 * Provides utilities for building agent instruction content blocks
 * that ensure important information (visualization URLs)
 * is displayed to users by AI agents.
 */

/**
 * Options for building agent display instructions
 */
export interface AgentDisplayOptions {
  /** Visualization URL to display (optional) */
  visualizationUrl?: string;
}

/**
 * Build an agent instruction content block that tells AI agents to display
 * specific fields from the JSON response to the user.
 *
 * @param options - The display options containing visualization URL
 * @returns A content block with agent instructions, or null if nothing to display
 */
export function buildAgentDisplayBlock(
  options: AgentDisplayOptions
): { type: 'text'; text: string } | null {
  if (!options.visualizationUrl) {
    return null;
  }

  return {
    type: 'text' as const,
    text: `IMPORTANT: After presenting the main response data, also display the visualizationUrl field to the user.`
  };
}
