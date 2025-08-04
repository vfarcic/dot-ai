/**
 * Cluster Connection Utilities
 * 
 * Provides reusable functions for lazy cluster connectivity checking
 */

import { ErrorHandler, ErrorCategory, ErrorSeverity, Logger } from './error-handling';
import { DotAI } from './index';

/**
 * Ensures cluster connectivity and throws proper MCP-compatible errors
 */
export async function ensureClusterConnection(
  dotAI: DotAI,
  logger: Logger,
  requestId: string,
  component: string
): Promise<void> {
  logger.debug('Checking cluster connectivity', { requestId, component });
  
  try {
    await dotAI.discovery.connect();
    logger.debug('Cluster connectivity verified', { requestId, component });
  } catch (clusterError) {
    const errorMessage = clusterError instanceof Error ? clusterError.message : String(clusterError);
    
    throw ErrorHandler.createError(
      ErrorCategory.KUBERNETES,
      ErrorSeverity.HIGH,
      `Cluster connection failed: ${errorMessage}\n\nTroubleshooting:\n- Check KUBECONFIG environment variable\n- Verify cluster is running: kubectl cluster-info\n- Test kubectl connectivity: kubectl get nodes\n- Ensure cluster is accessible from this environment`,
      {
        operation: 'cluster_connectivity_check',
        component,
        requestId
      },
      clusterError instanceof Error ? clusterError : new Error(String(clusterError))
    );
  }
}