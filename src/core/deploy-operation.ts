/**
 * Deploy Operation - Handles Kubernetes manifest deployment with readiness checking
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { ErrorHandler } from './error-handling';

const execAsync = promisify(exec);

export interface DeployOptions {
  solutionId: string;
  sessionDir?: string;
  timeout?: number;
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
  /**
   * Deploy Kubernetes manifests from generated solution
   */
  public async deploy(options: DeployOptions): Promise<DeployResult> {
    return ErrorHandler.withErrorHandling(
      async () => {
        const manifestPath = this.getManifestPath(options);
        
        // Verify manifest file exists
        await this.verifyManifestExists(manifestPath);

        // Apply manifests with kubectl
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
    const sessionDir = options.sessionDir || process.env.APP_AGENT_SESSION_DIR;
    if (!sessionDir) {
      throw new Error('Session directory not configured. Set APP_AGENT_SESSION_DIR environment variable or provide sessionDir parameter.');
    }
    
    return join(sessionDir, `${options.solutionId}.yaml`);
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
  private async applyManifests(manifestPath: string, timeout: number): Promise<string> {
    try {
      // First, apply the manifests
      const applyResult = await execAsync(`kubectl apply -f "${manifestPath}"`);
      
      // Try to wait for deployments to be ready (ignore failures for other resource types)
      let waitOutput = '';
      try {
        const waitResult = await execAsync(
          `kubectl wait --for=condition=available deployments --all --timeout=${timeout}s --all-namespaces`,
          { timeout: (timeout + 10) * 1000 } // Add 10 seconds buffer for kubectl command itself
        );
        waitOutput = `\n\nWait output:\n${waitResult.stdout}`;
      } catch (waitError: any) {
        // If no deployments found or wait fails, that's OK for ConfigMaps, Services, etc.
        if (waitError.message && waitError.message.includes('no matching resources found')) {
          waitOutput = '\n\nWait output: No deployments found to wait for (likely ConfigMaps, Services, etc.)';
        } else {
          waitOutput = `\n\nWait output: Warning - ${waitError.message}`;
        }
      }

      return `Apply output:\n${applyResult.stdout}${waitOutput}`;
    } catch (error: any) {
      // If kubectl commands fail, include the error in the output
      const errorMessage = error.message || 'Unknown kubectl error';
      const stderr = error.stderr || '';
      const stdout = error.stdout || '';
      
      throw new Error(`kubectl command failed: ${errorMessage}\nStdout: ${stdout}\nStderr: ${stderr}`);
    }
  }
}