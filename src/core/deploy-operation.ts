/**
 * Deploy Operation
 * 
 * Handles deployment of Kubernetes manifests with basic readiness checking
 */

import { executeKubectl, KubectlConfig } from './kubernetes-utils';
import { ErrorHandler } from './error-handling';
import * as path from 'path';
import * as fs from 'fs';

export interface DeployOptions {
  timeout?: number;
  sessionDir: string;
  solutionId: string;
}

export interface DeployResult {
  success: boolean;
  kubectlOutput: string;
  manifestPath: string;
  solutionId: string;
  readinessTimeout: boolean;
  message: string;
}

export class DeployOperation {
  
  async deploy(options: DeployOptions): Promise<DeployResult> {
    try {
      return await ErrorHandler.withErrorHandling(async () => {
        const manifestPath = this.getManifestPath(options);
        
        // Verify manifest file exists
        if (!fs.existsSync(manifestPath)) {
          throw new Error(`Manifest file not found: ${manifestPath}`);
        }

        const timeout = options.timeout || 30;
        const args = [
          'apply', 
          '-f', manifestPath, 
          '--wait', 
          `--timeout=${timeout}s`
        ];

        try {
          const kubectlOutput = await executeKubectl(args);
          
          return {
            success: true,
            kubectlOutput,
            manifestPath,
            solutionId: options.solutionId,
            readinessTimeout: false,
            message: 'Deployment completed successfully'
          };
        } catch (error: any) {
          const isTimeout = error.message.includes('timeout') || error.message.includes('timed out');
          
          return {
            success: false,
            kubectlOutput: error.message,
            manifestPath,
            solutionId: options.solutionId,
            readinessTimeout: isTimeout,
            message: isTimeout 
              ? 'Deployment applied but resources did not become ready within timeout'
              : 'Deployment failed'
          };
        }
      }, { 
        operation: 'deploy',
        component: 'deploy-operation' 
      });
    } catch (error: any) {
      // Handle errors that ErrorHandler.withErrorHandling throws
      const manifestPath = options.sessionDir 
        ? path.join(options.sessionDir, options.solutionId, 'manifest.yaml')
        : 'unknown';
      return {
        success: false,
        kubectlOutput: error.message || 'Unknown error',
        manifestPath,
        solutionId: options.solutionId,
        readinessTimeout: false,
        message: 'Deployment failed'
      };
    }
  }

  private getManifestPath(options: DeployOptions): string {
    if (!options.sessionDir) {
      throw new Error('Session directory must be specified');
    }
    return path.join(options.sessionDir, options.solutionId, 'manifest.yaml');
  }
}