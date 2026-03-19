/**
 * MCP Client Registry - Unified MCP Server Tool Access
 *
 * PRD #358: Provides a single, consistent way to access MCP server tools
 * from anywhere in the codebase (remediate, operate, query).
 *
 * Usage:
 *   // At startup (src/mcp/server.ts):
 *   initializeMcpClientRegistry(mcpClientManager);
 *
 *   // Anywhere in the codebase:
 *   if (isMcpClientInitialized()) {
 *     const tools = getMcpClientManager()!.getToolsForOperation('remediate');
 *   }
 */

import type { McpClientManager } from './mcp-client-manager';

/**
 * Global MCP client manager instance (set once at startup)
 */
let mcpClientManager: McpClientManager | null = null;

/**
 * Initialize the MCP client registry with a McpClientManager instance.
 * Must be called once at startup after MCP servers are discovered.
 */
export function initializeMcpClientRegistry(manager: McpClientManager): void {
  mcpClientManager = manager;
}

/**
 * Get the McpClientManager instance.
 * Returns null if not initialized.
 */
export function getMcpClientManager(): McpClientManager | null {
  return mcpClientManager;
}

/**
 * Check if the MCP client registry is initialized.
 */
export function isMcpClientInitialized(): boolean {
  return mcpClientManager !== null;
}

/**
 * Reset the MCP client registry (for testing only).
 * @internal
 */
export function resetMcpClientRegistry(): void {
  mcpClientManager = null;
}
