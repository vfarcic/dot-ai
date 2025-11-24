/**
 * CRD Availability Check with Global Caching
 *
 * Checks once per MCP server lifecycle if Solution CRD is available,
 * then caches the result globally to avoid repeated cluster queries.
 */

import * as k8s from '@kubernetes/client-node';

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

    // Check cluster for Solution CRD
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      const k8sApi = kc.makeApiClient(k8s.ApiextensionsV1Api);
      const crdName = 'solutions.dot-ai.devopstoolkit.live';

      await k8sApi.readCustomResourceDefinition({ name: crdName });

      // CRD exists, cache result
      this.crdAvailable = true;
      console.log('✅ Solution CRD available - Solution CR generation enabled');
      return true;
    } catch (error: any) {
      if (error.statusCode === 404 || error.response?.statusCode === 404) {
        // CRD not found, cache result
        this.crdAvailable = false;
        console.log('ℹ️  Solution CRD not available - Solution CR generation disabled (graceful degradation)');
        return false;
      }
      // Other errors (cluster unreachable, etc.) - don't cache, throw
      throw new Error(`Failed to check Solution CRD availability: ${error.message || error}`);
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
