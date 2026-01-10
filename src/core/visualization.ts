/**
 * Shared Visualization Utilities (PRD #320)
 *
 * Common utilities for visualization support across all MCP tools.
 * Provides session metadata interfaces, URL generation, and prompt selection.
 */

import { VisualizationType, VisualizationResponse } from '../interfaces/rest-api';

/**
 * Visualization mode prefix - when present in intent, return visualization data directly
 * Used by tools to detect when caller wants visualization output instead of summary
 */
export const VISUALIZATION_PREFIX = '[visualization]';

/**
 * Cached visualization structure stored in sessions
 * PRD #320: Added toolsUsed for test validation of mermaid validation
 */
export interface CachedVisualization {
  title: string;
  visualizations: Array<{
    id: string;
    label: string;
    type: VisualizationType;
    content: any;
  }>;
  insights: string[];
  toolsUsed?: string[];  // Tools called during visualization generation
  generatedAt: string;
}

/**
 * Base interface for visualization session data
 * All tools should include these fields for visualization support
 */
export interface BaseVisualizationData {
  /** Tool that created this session: 'query' | 'recommend' | 'remediate' | etc. */
  toolName: string;
  /** Optional stage for multi-stage tools (e.g., 'recommend', 'generateManifests') */
  stage?: string;
  /** Cached visualization to avoid re-generation */
  cachedVisualization?: CachedVisualization;
}

/**
 * Supported tool names for visualization
 */
export type VisualizationToolName =
  | 'query'
  | 'recommend'
  | 'remediate'
  | 'operate'
  | 'version'
  | 'projectSetup';

/**
 * Get the prompt file name for visualization
 * All tools use the unified visualize.md template (PRD #320)
 *
 * @param toolName - Name of the tool (unused, kept for API compatibility)
 * @returns Prompt file name (without .md extension)
 */
export function getPromptForTool(_toolName: string): string {
  return 'visualize';
}

/**
 * Get visualization URL if WEB_UI_BASE_URL is configured
 * Feature toggle - only returns URL when env var is set
 *
 * @param sessionIds - Single session ID or array of session IDs to include in URL
 * @returns Visualization URL or undefined if not configured
 */
export function getVisualizationUrl(sessionIds: string | string[]): string | undefined {
  const baseUrl = process.env.WEB_UI_BASE_URL;
  if (!baseUrl) {
    return undefined;
  }
  // Remove trailing slash if present, then append /v/{sessionId(s)}
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  // Join multiple session IDs with + separator
  const sessionPath = Array.isArray(sessionIds) ? sessionIds.join('+') : sessionIds;
  return `${normalizedBaseUrl}/v/${sessionPath}`;
}

/**
 * Extract the session prefix from a session ID
 * Session IDs are formatted: {prefix}-{timestamp}-{uuid}
 *
 * @param sessionId - Full session ID (e.g., 'qry-1704067200000-a1b2c3d4')
 * @returns Session prefix (e.g., 'qry')
 */
export function extractPrefixFromSessionId(sessionId: string): string {
  const parts = sessionId.split('-');
  // Return first part as prefix, default to 'qry' if invalid
  return parts[0] || 'qry';
}

/**
 * Session prefixes used by each tool
 * Useful for documentation and validation
 */
export const TOOL_SESSION_PREFIXES: Record<string, string> = {
  query: 'qry',
  recommend: 'sol', // "solution" - recommend tool provides solutions
  remediate: 'rem',
  operate: 'opr',
  version: 'ver',
  projectSetup: 'prj',
};

/**
 * Get the tool name from a session prefix
 * Reverse lookup from prefix to tool name
 *
 * @param prefix - Session prefix (e.g., 'qry')
 * @returns Tool name or undefined if not recognized
 */
export function getToolNameFromPrefix(prefix: string): string | undefined {
  for (const [tool, toolPrefix] of Object.entries(TOOL_SESSION_PREFIXES)) {
    if (toolPrefix === prefix) {
      return tool;
    }
  }
  return undefined;
}

/**
 * Parse AI response into VisualizationResponse
 * Extracts JSON from AI response, validates structure, normalizes insights
 *
 * @param aiResponse - Raw AI response string
 * @param toolsUsed - Optional array of tools used during generation
 * @returns Parsed VisualizationResponse
 * @throws Error if parsing or validation fails
 */
export function parseVisualizationResponse(aiResponse: string, toolsUsed?: string[]): VisualizationResponse {
  // Extract JSON from response - it may have text before/after the JSON block
  let jsonContent = aiResponse.trim();

  // Find JSON block in markdown code fence
  const jsonBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonContent = jsonBlockMatch[1].trim();
  } else if (!jsonContent.startsWith('{')) {
    // Try to find raw JSON object if no code fence
    const jsonStart = jsonContent.indexOf('{');
    const jsonEnd = jsonContent.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
    }
  }

  const parsed = JSON.parse(jsonContent);

  // Validate required fields
  if (!parsed.title || !Array.isArray(parsed.visualizations) || !Array.isArray(parsed.insights)) {
    throw new Error('Invalid visualization response structure');
  }

  // Validate each visualization has required fields
  for (const viz of parsed.visualizations) {
    if (!viz.id || !viz.label || !viz.type || viz.content === undefined) {
      throw new Error(`Invalid visualization: missing required fields in ${JSON.stringify(viz)}`);
    }
    if (!['mermaid', 'cards', 'code', 'table', 'diff'].includes(viz.type)) {
      throw new Error(`Invalid visualization type: ${viz.type}`);
    }
  }

  // Normalize insights to strings if they are objects
  const normalizedInsights = parsed.insights.map((insight: any) => {
    if (typeof insight === 'string') {
      return insight;
    }
    // Convert object insights to string format
    if (insight.title && insight.description) {
      const severity = insight.severity ? ` [${insight.severity}]` : '';
      return `${insight.title}${severity}: ${insight.description}`;
    }
    return String(insight);
  });

  return {
    ...parsed,
    insights: normalizedInsights,
    ...(toolsUsed && { toolsUsed })
  } as VisualizationResponse;
}
