/**
 * CRD Availability Check with Global Caching
 *
 * Checks once per MCP server lifecycle if Solution CRD is available,
 * then caches the result globally to avoid repeated cluster queries.
 *
 * PRD #359: Uses unified plugin registry for K8s operations
 */

import { invokePluginTool, isPluginInitialized } from './plugin-registry';

/**
 * Singleton cache for CRD availability check
 * Checks once per MCP server lifecycle, caches result globally
 */
class CRDAvailabilityCache {
  private static instance: CRDAvailabilityCache;
  private crdAvailable: boolean | null = null;

  private constructor() {}

  static getInstance(): CRDAvailabilityCache {
    if (!CRDAvailabilityCache.instance) {
      CRDAvailabilityCache.instance = new CRDAvailabilityCache();
    }
    return CRDAvailabilityCache.instance;
  }

  async isSolutionCRDAvailable(): Promise<boolean> {
    // Return cached result if available
    if (this.crdAvailable !== null) {
      return this.crdAvailable;
    }

    // PRD #359: All K8s operations go through unified plugin registry
    if (!isPluginInitialized()) {
      console.log('ℹ️  Plugin system not available - Solution CR generation disabled');
      this.crdAvailable = false;
      return false;
    }

    // Check cluster for Solution CRD via plugin
    const crdName = 'solutions.dot-ai.devopstoolkit.live';

    try {
      const response = await invokePluginTool('agentic-tools', 'kubectl_get_resource_json', {
        resource: `crd/${crdName}`
      });

      if (response.success) {
        // Check for nested error - plugin wraps kubectl errors in { success: false, error: "..." }
        const result = response.result as { success?: boolean; error?: string } | undefined;
        if (result && result.success === false) {
          const errorMsg = result.error || '';
          if (errorMsg.includes('NotFound') || errorMsg.includes('not found')) {
            this.crdAvailable = false;
            console.log('ℹ️  Solution CRD not available - Solution CR generation disabled (graceful degradation)');
            return false;
          }
          throw new Error(`Failed to check Solution CRD availability: ${errorMsg}`);
        }
        // CRD exists, cache result
        this.crdAvailable = true;
        console.log('✅ Solution CRD available - Solution CR generation enabled');
        return true;
      } else {
        // CRD not found or error
        const errorMsg = response.error?.message || '';
        if (errorMsg.includes('NotFound') || errorMsg.includes('not found')) {
          this.crdAvailable = false;
          console.log('ℹ️  Solution CRD not available - Solution CR generation disabled (graceful degradation)');
          return false;
        }
        // Other errors - don't cache, throw
        throw new Error(`Failed to check Solution CRD availability: ${errorMsg}`);
      }
    } catch (error: any) {
      // Check if it's a "not found" error
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('NotFound') || errorMsg.includes('not found')) {
        this.crdAvailable = false;
        console.log('ℹ️  Solution CRD not available - Solution CR generation disabled (graceful degradation)');
        return false;
      }
      // Other errors - don't cache, throw
      throw new Error(`Failed to check Solution CRD availability: ${errorMsg}`);
    }
  }

  /**
   * Reset cache (for testing or manual refresh)
   */
  reset(): void {
    this.crdAvailable = null;
  }
}

/**
 * Helper function for checking CRD availability
 * Use this function throughout the codebase
 * PRD #359: No longer requires pluginManager parameter - uses unified registry
 */
export async function isSolutionCRDAvailable(): Promise<boolean> {
  const cache = CRDAvailabilityCache.getInstance();
  return cache.isSolutionCRDAvailable();
}

/**
 * Reset CRD availability cache (primarily for testing)
 */
export function resetCRDAvailabilityCache(): void {
  const cache = CRDAvailabilityCache.getInstance();
  cache.reset();
}
