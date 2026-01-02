/**
 * Shared Visualization Utilities (PRD #320)
 *
 * Common utilities for visualization support across all MCP tools.
 * Provides session metadata interfaces, URL generation, and prompt selection.
 */

import { VisualizationType } from '../interfaces/rest-api';

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
