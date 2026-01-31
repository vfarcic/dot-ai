/**
 * Plugin Registry - Unified Plugin Tool Invocation
 *
 * PRD #359: Provides a single, consistent way to invoke plugin tools from anywhere
 * in the codebase. Replaces scattered plugin manager passing and module-level setters.
 *
 * Usage:
 *   // At startup (src/mcp/server.ts):
 *   initializePluginRegistry(pluginManager);
 *
 *   // Anywhere in the codebase:
 *   const response = await invokePluginTool('agentic-tools', 'vector_search', { ... });
 */

import type { PluginManager } from './plugin-manager';
import type { InvokeResponse } from './plugin-types';

/**
 * Global plugin manager instance (set once at startup)
 */
let pluginManager: PluginManager | null = null;

/**
 * Initialize the plugin registry with a PluginManager instance.
 * Must be called once at startup before any plugin tool invocations.
 */
export function initializePluginRegistry(pm: PluginManager): void {
  pluginManager = pm;
}

/**
 * Get the PluginManager instance.
 * Returns null if not initialized.
 */
export function getPluginManager(): PluginManager | null {
  return pluginManager;
}

/**
 * Check if the plugin registry is initialized.
 */
export function isPluginInitialized(): boolean {
  return pluginManager !== null;
}

/**
 * Invoke a tool on a specific plugin.
 *
 * @param plugin - The plugin name (e.g., 'agentic-tools')
 * @param tool - The tool name (e.g., 'vector_search', 'kubectl_get_resource_json')
 * @param args - Tool arguments
 * @returns InvokeResponse with success/error status and result
 * @throws Error if plugin registry is not initialized
 *
 * @example
 * // Invoke a vector tool
 * const response = await invokePluginTool('agentic-tools', 'vector_search', {
 *   collection: 'capabilities',
 *   embedding: [...],
 *   limit: 10
 * });
 *
 * // Invoke a kubectl tool
 * const response = await invokePluginTool('agentic-tools', 'kubectl_get_resource_json', {
 *   resource: 'namespace/kube-system',
 *   field: 'metadata'
 * });
 */
export async function invokePluginTool(
  plugin: string,
  tool: string,
  args: Record<string, unknown>
): Promise<InvokeResponse> {
  if (!pluginManager) {
    throw new Error('Plugin registry not initialized. Call initializePluginRegistry() at startup.');
  }
  return pluginManager.invokeToolOnPlugin(plugin, tool, args);
}

/**
 * Reset the plugin registry (for testing only).
 * @internal
 */
export function resetPluginRegistry(): void {
  pluginManager = null;
}
