/**
 * Tool Registry
 *
 * Aggregates all kubectl tools and exports them for the describe and invoke hooks.
 */

import { ToolDefinition } from '../types';
import { KubectlTool } from './base';

// Import all kubectl tools
import { kubectlApiResources } from './kubectl-api-resources';
import { kubectlGet } from './kubectl-get';
import { kubectlDescribe } from './kubectl-describe';
import { kubectlLogs } from './kubectl-logs';
import { kubectlEvents } from './kubectl-events';
import { kubectlPatchDryrun } from './kubectl-patch-dryrun';
import { kubectlApplyDryrun } from './kubectl-apply-dryrun';
import { kubectlDeleteDryrun } from './kubectl-delete-dryrun';
import { kubectlGetCrdSchema } from './kubectl-get-crd-schema';
import { kubectlGetResourceJson } from './kubectl-get-resource-json';

/**
 * All kubectl tools in a single array
 * Add new tools here to register them automatically
 */
const ALL_TOOLS: KubectlTool[] = [
  kubectlApiResources,
  kubectlGet,
  kubectlDescribe,
  kubectlLogs,
  kubectlEvents,
  kubectlPatchDryrun,
  kubectlApplyDryrun,
  kubectlDeleteDryrun,
  kubectlGetCrdSchema,
  kubectlGetResourceJson,
];

/**
 * Tool definitions for the describe hook
 * Extracted from each tool's definition property
 */
export const TOOLS: ToolDefinition[] = ALL_TOOLS.map((tool) => tool.definition);

/**
 * Tool handler function type
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Map of tool names to their handlers for the invoke hook
 * Built automatically from the ALL_TOOLS array
 */
export const TOOL_HANDLERS: Record<string, ToolHandler> = Object.fromEntries(
  ALL_TOOLS.map((tool) => [tool.definition.name, tool.handler])
);
