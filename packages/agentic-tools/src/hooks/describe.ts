/**
 * Describe Hook
 *
 * Returns plugin metadata and tool definitions.
 * Called by dot-ai at startup to discover available tools.
 */

import { DescribeResponse } from '../types';
import { TOOLS } from '../tools';

const PLUGIN_NAME = 'agentic-tools';
const PLUGIN_VERSION = '1.0.0';

/**
 * Handle describe hook request
 * Returns plugin info and all available tool definitions
 */
export function handleDescribe(): DescribeResponse {
  return {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    tools: TOOLS
  };
}
