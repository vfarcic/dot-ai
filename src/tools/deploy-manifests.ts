/**
 * Deploy Manifests Tool - Apply Kubernetes manifests with readiness checking
 */

import { z } from 'zod';
import { ErrorHandler } from '../core/error-handling';
import { DeployOperation } from '../core/deploy-operation';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import { ensureClusterConnection } from '../core/cluster-utils';

// Tool metadata for direct MCP registration
export const DEPLOYMANIFESTS_TOOL_NAME = 'deployManifests';
export const DEPLOYMANIFESTS_TOOL_DESCRIPTION = 'Deploy Kubernetes manifests from generated solution with kubectl apply --wait';

// Zod schema for MCP registration
export const DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA = {
  solutionId: z.string().regex(/^sol-\d+-[a-f0-9]{8}$/).describe('Solution ID to deploy (e.g., sol-1762983784617-9ddae2b8)'),
  timeout: z.number().min(1).max(600).optional().describe('Deployment timeout in seconds (default: 30)')
};


/**
 * Direct MCP tool handler for deployManifests functionality
 */
export async function handleDeployManifestsTool(
  args: { solutionId: string; timeout?: number },
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Handling deployManifests request', { 
        requestId, 
        solutionId: args?.solutionId,
        timeout: args?.timeout
      });

      // Input validation is handled automatically by MCP SDK with Zod schema
      // args are already validated and typed when we reach this point
      
      // Ensure cluster connectivity before proceeding
      await ensureClusterConnection(dotAI, logger, requestId, 'DeployManifestsTool');
      
      const deployOp = new DeployOperation();
      
      const deployOptions = {
        solutionId: args.solutionId,
        timeout: args.timeout || 30
      };

      logger.info('Starting deployment operation', {
        solutionId: args.solutionId,
        timeout: deployOptions.timeout,
        requestId
      });

      const result = await deployOp.deploy(deployOptions);

      logger.info('Deployment operation completed', {
        success: result.success,
        solutionId: result.solutionId,
        manifestPath: result.manifestPath,
        readinessTimeout: result.readinessTimeout,
        requestId
      });

      // Prepare response with deployment status
      const response = {
        success: result.success,
        solutionId: result.solutionId,
        manifestPath: result.manifestPath,
        readinessTimeout: result.readinessTimeout,
        message: result.message,
        kubectlOutput: result.kubectlOutput,
        // Additional deployment status info
        deploymentComplete: result.success && !result.readinessTimeout,
        requiresStatusCheck: result.success && result.readinessTimeout,
        timestamp: new Date().toISOString()
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(response, null, 2)
        }]
      };
    },
    {
      operation: 'deploy_manifests',
      component: 'DeployManifestsTool',
      requestId,
      input: args
    }
  );
}

