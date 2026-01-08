/**
 * Agent Display Utilities
 *
 * Provides utilities for building agent instruction content blocks
 * that ensure important information (visualization URLs, feedback messages)
 * is displayed to users by AI agents.
 */

/**
 * Options for building agent display instructions
 */
export interface AgentDisplayOptions {
  /** Visualization URL to display (optional) */
  visualizationUrl?: string;
  /** Feedback message to display (optional) */
  feedbackMessage?: string;
}

/**
 * Build an agent instruction content block that tells AI agents to display
 * specific fields from the JSON response to the user.
 *
 * @param options - The display options containing visualization URL and/or feedback message
 * @returns A content block with agent instructions, or null if nothing to display
 */
export function buildAgentDisplayBlock(
  options: AgentDisplayOptions
): { type: 'text'; text: string } | null {
  const fields: string[] = [];

  if (options.visualizationUrl) {
    fields.push('visualizationUrl');
  }

  if (options.feedbackMessage) {
    fields.push('feedbackMessage');
  }

  if (fields.length === 0) {
    return null;
  }

  const fieldList = fields.join(' and ');

  return {
    type: 'text' as const,
    text: `IMPORTANT: After presenting the main response data, also display the ${fieldList} field${fields.length > 1 ? 's' : ''} to the user.`
  };
}
