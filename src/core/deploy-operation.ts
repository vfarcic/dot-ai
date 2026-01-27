/**
 * Deploy Operation - Handles Kubernetes manifest deployment with readiness checking
 * PRD #343: Uses plugin system for kubectl operations
 */

import { access, readFile } from 'fs/promises';
import { join } from 'path';
import { ErrorHandler } from './error-handling';
import type { PluginManager } from './plugin-manager';

export interface DeployOptions {
  solutionId: string;
  sessionDir?: string;
  timeout?: number;
  kubeconfig?: string;
}

export interface DeployResult {
  success: boolean;
  solutionId: string;
  manifestPath: string;
  readinessTimeout: boolean;
  message: string;
  kubectlOutput: string;
}

export class DeployOperation {
  private pluginManager: PluginManager;

  constructor(pluginManager: PluginManager) {
    this.pluginManager = pluginManager;
  }

  /**
   * Deploy Kubernetes manifests from generated solution
   * PRD #343: Uses plugin for kubectl operations
   */
  public async deploy(options: DeployOptions): Promise<DeployResult> {
    return ErrorHandler.withErrorHandling(
      async () => {
        const manifestPath = this.getManifestPath(options);

        // Verify manifest file exists
        await this.verifyManifestExists(manifestPath);

        // Apply manifests with kubectl via plugin
        const kubectlOutput = await this.applyManifests(manifestPath, options.timeout || 30);

        return {
          success: true,
          solutionId: options.solutionId,
          manifestPath,
          readinessTimeout: false,
          message: 'Deployment completed successfully',
          kubectlOutput
        };
      },
      {
        operation: 'deploy',
        component: 'deploy-operation'
      }
    );
  }

  /**
   * Get the manifest file path for the solution
   */
  private getManifestPath(options: DeployOptions): string {
    // Use sessionDir if provided, otherwise use tmp directory (for recommend tool compatibility)
    const tmpDir = options.sessionDir || join(process.cwd(), 'tmp');
    return join(tmpDir, `${options.solutionId}.yaml`);
  }

  /**
   * Verify that the manifest file exists
   */
  private async verifyManifestExists(manifestPath: string): Promise<void> {
    try {
      await access(manifestPath);
    } catch (error) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
    }
  }

  /**
   * Execute kubectl command via plugin
   * PRD #343: All kubectl operations go through plugin
   */
  private async executeKubectl(args: string[]): Promise<string> {
    const response = await this.pluginManager.invokeTool('kubectl_exec_command', { args });
    if (response.success) {
      if (typeof response.result === 'object' && response.result !== null) {
        const result = response.result as any;
        // Check for nested error - plugin wraps kubectl errors in { success: false, error: "..." }
        if (result.success === false) {
          throw new Error(result.error || result.message || 'kubectl command failed');
        }
        // Return only the data field - never pass JSON wrapper to consumers
        if (result.data !== undefined) {
          return String(result.data);
        }
        if (typeof result === 'string') {
          return result;
        }
        throw new Error('Plugin returned unexpected response format - missing data field');
      }
      return String(response.result || '');
    } else {
      throw new Error(response.error?.message || 'kubectl command failed via plugin');
    }
  }

  /**
   * Apply manifests using kubectl with readiness checking
   * PRD #343: Uses kubectl_apply tool with manifest content (not file path)
   * File paths don't work across containers - must pass content via stdin
   */
  private async applyManifests(manifestPath: string, timeout: number): Promise<string> {
    // Read manifest content from file (file is in MCP server container)
    const manifestContent = await readFile(manifestPath, 'utf8');

    // Apply using kubectl_apply tool which accepts content via stdin
    const applyResult = await this.applyManifestContent(manifestContent);

    // Try to wait for deployments to be ready (ignore failures for other resource types)
    let waitOutput = '';
    try {
      const waitResult = await this.executeKubectl([
        'wait',
        '--for=condition=available',
        'deployments',
        '--all',
        `--timeout=${timeout}s`,
        '--all-namespaces'
      ]);
      waitOutput = `\n\nWait output:\n${waitResult}`;
    } catch (waitError: any) {
      // If no deployments found or wait fails, that's OK for other resource types (Services, etc.)
      if (waitError.message && waitError.message.includes('no matching resources found')) {
        waitOutput = '\n\nWait output: No deployments found to wait for (likely Services, CRs, etc.)';
      } else {
        waitOutput = `\n\nWait output: Warning - ${waitError.message}`;
      }
    }

    return `Apply output:\n${applyResult}${waitOutput}`;
  }

  /**
   * Apply manifest content using kubectl_apply tool
   * PRD #343: Uses plugin's kubectl_apply tool with stdin
   */
  private async applyManifestContent(manifest: string): Promise<string> {
    const response = await this.pluginManager.invokeTool('kubectl_apply', { manifest });
    if (response.success) {
      if (typeof response.result === 'object' && response.result !== null) {
        const result = response.result as any;
        // Check for nested error
        if (result.success === false) {
          throw new Error(result.error || result.message || 'kubectl apply failed');
        }
        // Return only the data field
        if (result.data !== undefined) {
          return String(result.data);
        }
        if (typeof result === 'string') {
          return result;
        }
        throw new Error('Plugin returned unexpected response format - missing data field');
      }
      return String(response.result || '');
    } else {
      throw new Error(response.error?.message || 'kubectl apply failed via plugin');
    }
  }
}