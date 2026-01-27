/**
 * Deploy Manifests Tool - Apply Kubernetes manifests or execute Helm installations
 * Supports both capability-based solutions (kubectl apply) and Helm-based solutions (helm install)
 */

import { z } from 'zod';
import { ErrorHandler } from '../core/error-handling';
import { DeployOperation } from '../core/deploy-operation';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import { GenericSessionManager } from '../core/generic-session-manager';
import type { SolutionData } from './recommend';
import { extractUserAnswers } from '../core/solution-utils';
import { HelmChartInfo } from '../core/helm-types';
import type { PluginManager } from '../core/plugin-manager';
import * as fs from 'fs';
import * as path from 'path';

// PRD #343: Inline utilities (helm-utils.ts removed - all helm operations via plugin)

/**
 * Get the path for Helm values file
 */
function getHelmValuesPath(solutionId: string): string {
  const tmpDir = path.join(process.cwd(), 'tmp');
  return path.join(tmpDir, `${solutionId}-values.yaml`);
}

/**
 * Check if Helm values file exists for a solution
 */
function helmValuesExist(solutionId: string): boolean {
  return fs.existsSync(getHelmValuesPath(solutionId));
}

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
 * PRD #343: pluginManager required for kubectl operations
 */
export async function handleDeployManifestsTool(
  args: { solutionId: string; timeout?: number },
  dotAI: DotAI,
  logger: Logger,
  requestId: string,
  pluginManager: PluginManager
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

      // Load solution session to determine solution type
      const sessionManager = new GenericSessionManager<SolutionData>('sol');
      const session = sessionManager.getSession(args.solutionId);

      if (!session) {
        throw new Error(`Solution not found: ${args.solutionId}`);
      }

      const solution = session.data;
      const timeout = args.timeout || 30;

      logger.debug('Solution loaded successfully', {
        solutionId: args.solutionId,
        solutionType: solution.type
      });

      // Branch based on solution type
      if (solution.type === 'helm') {
        logger.info('Detected Helm solution, using Helm deployment flow', {
          solutionId: args.solutionId,
          chart: solution.chart ? `${solution.chart.repositoryName}/${solution.chart.chartName}` : 'unknown'
        });

        if (!solution.chart) {
          throw new Error('Helm solution missing chart information');
        }

        const chart: HelmChartInfo = solution.chart;
        const userAnswers = extractUserAnswers(solution);
        const releaseName = userAnswers.name;
        const namespace = userAnswers.namespace || 'default';

        if (!releaseName) {
          throw new Error('Release name (name) is required for Helm deployment');
        }

        // Get values content if values file exists
        // PRD #343: Read values and pass to plugin (no file path to plugin)
        let valuesYaml: string | undefined;
        if (helmValuesExist(args.solutionId)) {
          valuesYaml = fs.readFileSync(getHelmValuesPath(args.solutionId), 'utf8');
        }

        logger.info('Starting Helm deployment via plugin', {
          solutionId: args.solutionId,
          chart: `${chart.repositoryName}/${chart.chartName}`,
          releaseName,
          namespace,
          hasValuesFile: !!valuesYaml,
          timeout,
          requestId
        });

        // PRD #343: All Helm operations go through plugin system
        // First, add/update the Helm repository
        const repoResult = await pluginManager.invokeTool('helm_repo_add', {
          name: chart.repositoryName,
          url: chart.repository
        });

        if (!repoResult.success) {
          logger.warn('Helm repo add failed', { error: repoResult.error?.message });
        }

        // Deploy using helm_install with wait
        const installResult = await pluginManager.invokeTool('helm_install', {
          releaseName,
          chart: `${chart.repositoryName}/${chart.chartName}`,
          namespace,
          values: valuesYaml,
          version: chart.version,
          dryRun: false,
          wait: true,
          timeout: `${timeout}s`,
          createNamespace: true
        });

        // Check for nested error in result
        let nestedError: string | undefined;
        if (installResult.success && typeof installResult.result === 'object' && installResult.result !== null) {
          const nestedResult = installResult.result as any;
          if (nestedResult.success === false) {
            nestedError = nestedResult.error || nestedResult.message || 'Helm install failed';
          }
        }

        // Extract only the data field - never pass JSON wrapper
        let output = '';
        if (installResult.success && !nestedError) {
          if (typeof installResult.result === 'object' && installResult.result !== null) {
            const resultData = installResult.result as any;
            if (resultData.data !== undefined) {
              output = String(resultData.data);
            } else if (typeof resultData === 'string') {
              output = resultData;
            }
            // Don't throw error here - empty output is acceptable for Helm
          } else {
            output = String(installResult.result || '');
          }
        }

        const result = {
          success: installResult.success && !nestedError,
          output,
          error: nestedError || (!installResult.success ? installResult.error?.message : undefined)
        };

        logger.info('Helm deployment completed', {
          success: result.success,
          solutionId: args.solutionId,
          releaseName,
          namespace,
          requestId
        });

        // Update session with deployed stage for UI page refresh support
        if (result.success) {
          sessionManager.updateSession(args.solutionId, {
            stage: 'deployed'
          });
        }

        const response = {
          success: result.success,
          solutionId: args.solutionId,
          solutionType: 'helm',
          releaseName,
          namespace,
          chart: {
            repository: chart.repository,
            repositoryName: chart.repositoryName,
            chartName: chart.chartName,
            version: chart.version
          },
          message: result.success
            ? `Helm release "${releaseName}" deployed successfully to namespace "${namespace}"`
            : `Helm deployment failed: ${result.error}`,
          helmOutput: result.output || result.error,
          deploymentComplete: result.success,
          timestamp: new Date().toISOString(),
          agentInstructions: 'Deployment command executed. To verify the deployment is running correctly and resources are healthy, use the query tool to check pod status, events, and logs.'
        };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(response, null, 2)
          }]
        };
      }

      // Capability-based solution: Use existing DeployOperation
      // PRD #343: Pass pluginManager for kubectl operations
      logger.info('Using capability-based deployment flow', {
        solutionId: args.solutionId
      });

      const deployOp = new DeployOperation(pluginManager);

      const deployOptions = {
        solutionId: args.solutionId,
        timeout
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

      // Update session with deployed stage for UI page refresh support
      if (result.success) {
        sessionManager.updateSession(args.solutionId, {
          stage: 'deployed'
        });
      }

      // Prepare response with deployment status
      const response = {
        success: result.success,
        solutionId: result.solutionId,
        solutionType: 'capability',
        manifestPath: result.manifestPath,
        readinessTimeout: result.readinessTimeout,
        message: result.message,
        kubectlOutput: result.kubectlOutput,
        // Additional deployment status info
        deploymentComplete: result.success && !result.readinessTimeout,
        requiresStatusCheck: result.success && result.readinessTimeout,
        timestamp: new Date().toISOString(),
        agentInstructions: 'Deployment command executed. To verify the deployment is running correctly and resources are healthy, use the query tool to check pod status, events, and logs.'
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

