/**
 * Deploy Operation - Handles Kubernetes manifest deployment with readiness checking
 */

import { access } from 'fs/promises';
import { join } from 'path';
import { ErrorHandler } from './error-handling';
import { executeKubectl, KubectlConfig } from './kubernetes-utils';

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
  private kubectlConfig: KubectlConfig;

  constructor(kubeconfig?: string) {
    this.kubectlConfig = {
      kubeconfig: kubeconfig || process.env.KUBECONFIG
    };
  }

  /**
   * Deploy Kubernetes manifests from generated solution
   */
  public async deploy(options: DeployOptions): Promise<DeployResult> {
    return ErrorHandler.withErrorHandling(
      async () => {
        const manifestPath = this.getManifestPath(options);
        
        // Verify manifest file exists
        await this.verifyManifestExists(manifestPath);

        // Update kubeconfig if provided in options
        const kubectlConfig = {
          ...this.kubectlConfig,
          kubeconfig: options.kubeconfig || this.kubectlConfig.kubeconfig
        };

        // Apply manifests with kubectl
        const kubectlOutput = await this.applyManifests(manifestPath, options.timeout || 30, kubectlConfig);

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
   * Apply manifests using kubectl with readiness checking
   */
  private async applyManifests(manifestPath: string, timeout: number, kubectlConfig: KubectlConfig): Promise<string> {
    // First, apply the manifests
    const applyResult = await executeKubectl(['apply', '-f', `"${manifestPath}"`], kubectlConfig);
    
    // Try to wait for deployments to be ready (ignore failures for other resource types)
    let waitOutput = '';
    try {
      const waitResult = await executeKubectl([
        'wait', 
        '--for=condition=available', 
        'deployments', 
        '--all', 
        `--timeout=${timeout}s`, 
        '--all-namespaces'
      ], {
        ...kubectlConfig,
        timeout: (timeout + 10) * 1000 // Add 10 seconds buffer for kubectl command itself
      });
      waitOutput = `\n\nWait output:\n${waitResult}`;
    } catch (waitError: any) {
      // If no deployments found or wait fails, that's OK for ConfigMaps, Services, etc.
      if (waitError.message && waitError.message.includes('no matching resources found')) {
        waitOutput = '\n\nWait output: No deployments found to wait for (likely ConfigMaps, Services, etc.)';
      } else {
        waitOutput = `\n\nWait output: Warning - ${waitError.message}`;
      }
    }

    return `Apply output:\n${applyResult}${waitOutput}`;
  }
}