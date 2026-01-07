/**
 * Shared Kubernetes Utilities
 *
 * Common functions for interacting with Kubernetes clusters
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { withKubectlTracing } from './tracing';
import { KUBERNETES_ERROR_TEMPLATES } from './constants';

const execAsync = promisify(exec);

// Enhanced interfaces for kubectl-based discovery
export interface KubectlConfig {
  context?: string;
  namespace?: string;
  kubeconfig?: string;
  timeout?: number;
  stdin?: string;  // For piping input to kubectl (e.g., apply -f -)
}

/**
 * Execute kubectl command with proper configuration
 * Automatically traced with OpenTelemetry
 */
export async function executeKubectl(args: string[], config?: KubectlConfig): Promise<string> {
  // Wrap entire execution with tracing
  return withKubectlTracing(args, config, async () => {
    const command = buildKubectlCommand(args, config);
    const timeout = config?.timeout || 30000;

    try {
      // If stdin is provided, use spawn for proper stdin piping
      if (config?.stdin) {
        const { spawn } = require('child_process');
        return new Promise((resolve, reject) => {
          let stdout = '';
          let stderr = '';

          const proc = spawn('sh', ['-c', command], {
            timeout,
            maxBuffer: 100 * 1024 * 1024
          });

          proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
          proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

          proc.on('error', (error: Error) => reject(error));
          proc.on('close', (code: number) => {
            if (code !== 0) {
              reject(new Error(`kubectl command failed: ${stderr || stdout}`));
            } else if (stderr && !stderr.includes('Warning') && !stderr.includes('No resources found')) {
              reject(new Error(`kubectl command failed: ${stderr}`));
            } else {
              resolve(stdout.trim());
            }
          });

          // Write stdin and close
          proc.stdin.write(config.stdin);
          proc.stdin.end();
        });
      }

      // No stdin - use regular execAsync
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 100 * 1024 * 1024  // 100MB buffer for large clusters with 1000+ CRDs
      });
      if (stderr && !stderr.includes('Warning') && !stderr.includes('No resources found')) {
        throw new Error(`kubectl command failed: ${stderr}`);
      }
      return stdout.trim();
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error('kubectl binary not found. Please install kubectl and ensure it\'s in your PATH.');
      }

      // Use error classification for better error messages
      const classified = ErrorClassifier.classifyError(error);
      throw new Error(classified.enhancedMessage);
    }
  });
}

/**
 * Build kubectl command string with proper flags
 */
/**
 * Safely escape shell arguments to prevent command injection
 */
function escapeShellArg(arg: string): string {
  if (!arg || typeof arg !== 'string') {
    return '""';
  }
  
  // If the argument contains only safe characters, return as-is
  if (/^[a-zA-Z0-9._/-]+$/.test(arg)) {
    return arg;
  }
  
  // Otherwise, quote and escape
  return `"${arg.replace(/["\\]/g, '\\$&')}"`;
}

export function buildKubectlCommand(args: string[], config?: KubectlConfig): string {
  const cmdParts = ['kubectl'];
  
  if (config?.kubeconfig) {
    cmdParts.push('--kubeconfig', escapeShellArg(config.kubeconfig));
  }
  
  if (config?.context) {
    cmdParts.push('--context', escapeShellArg(config.context));
  }
  
  if (config?.namespace) {
    cmdParts.push('--namespace', escapeShellArg(config.namespace));
  }
  
  // Safely add all arguments
  args.forEach(arg => cmdParts.push(escapeShellArg(arg)));
  
  return cmdParts.join(' ');
}

// Enhanced Error Classification System
export class ErrorClassifier {
  static classifyError(error: Error): { type: string; enhancedMessage: string } {
    const originalMessage = error.message;

    // Connection and Network Errors
    if (this.isNetworkError(originalMessage)) {
      return {
        type: 'network',
        enhancedMessage: this.enhanceNetworkError(originalMessage)
      };
    }

    // Authentication Errors
    if (this.isAuthenticationError(originalMessage)) {
      return {
        type: 'authentication',
        enhancedMessage: this.enhanceAuthenticationError(originalMessage)
      };
    }

    // Authorization/RBAC Errors
    if (this.isAuthorizationError(originalMessage)) {
      return {
        type: 'authorization',
        enhancedMessage: this.enhanceAuthorizationError(originalMessage)
      };
    }

    // API Availability Errors
    if (this.isAPIAvailabilityError(originalMessage)) {
      return {
        type: 'api-availability',
        enhancedMessage: this.enhanceAPIAvailabilityError(originalMessage)
      };
    }

    // Kubeconfig Validation Errors
    if (this.isKubeconfigError(originalMessage)) {
      return {
        type: 'kubeconfig',
        enhancedMessage: this.enhanceKubeconfigError(originalMessage)
      };
    }

    // Version Compatibility Errors
    if (this.isVersionCompatibilityError(originalMessage)) {
      return {
        type: 'version',
        enhancedMessage: this.enhanceVersionCompatibilityError(originalMessage)
      };
    }

    // Default: return original message with basic enhancement
    return {
      type: 'unknown',
      enhancedMessage: `${originalMessage}\n\nTroubleshooting steps:\n- Run 'kubectl cluster-info' to verify cluster connectivity\n- Check your kubeconfig with 'kubectl config view'\n- Verify cluster endpoint accessibility`
    };
  }

  private static isNetworkError(message: string): boolean {
    // Fixed: Avoid catastrophic backtracking by using non-overlapping alternation
    const networkPatterns = [
      'getaddrinfo ENOTFOUND',
      'timeout',
      'ECONNREFUSED', 
      'ENOTFOUND',
      'network',
      'unreachable'
    ];
    return networkPatterns.some(pattern => message.toLowerCase().includes(pattern.toLowerCase()));
  }

  private static isAuthenticationError(message: string): boolean {
    // Fixed: Avoid catastrophic backtracking by using non-overlapping alternation
    const authPatterns = [
      'unauthorized',
      'invalid bearer token',
      'certificate',
      'auth',
      'authentication'
    ];
    return authPatterns.some(pattern => message.toLowerCase().includes(pattern.toLowerCase()));
  }

  private static isAuthorizationError(message: string): boolean {
    return /forbidden|cannot list|cannot get|cannot create|RBAC|permission denied/i.test(message);
  }

  private static isAPIAvailabilityError(message: string): boolean {
    return /server could not find|resource type.*not found|doesn't have a resource type|no matches for kind/i.test(message);
  }

  private static isKubeconfigError(message: string): boolean {
    // Be more specific - don't match "path does not exist" errors which are about manifest files
    return /context.*does not exist|kubeconfig.*not found|invalid.*kubeconfig|config.*not found|no Auth Provider/i.test(message) && 
           !/the path.*does not exist/.test(message);
  }

  private static isVersionCompatibilityError(message: string): boolean {
    return /server version|version.*old|unsupported.*version|api.*version/i.test(message);
  }

  private static enhanceNetworkError(message: string): string {
    if (message.includes('getaddrinfo ENOTFOUND')) {
      return `DNS resolution failed: Cannot resolve cluster endpoint hostname.\n\nTroubleshooting steps:\n- Check cluster endpoint in kubeconfig: kubectl config view\n- Verify network connectivity and DNS settings\n- Confirm cluster is running and accessible\n- Check VPN connection if using private cluster\n\nOriginal error: ${message}`;
    }

    if (message.includes('timeout')) {
      return `Connection timeout: Unable to reach cluster within timeout period.\n\nTroubleshooting steps:\n- Check network latency to cluster endpoint\n- Increase timeout value if needed\n- Verify cluster is responsive: kubectl get nodes\n- Check firewall and proxy settings\n\nOriginal error: ${message}`;
    }

    return `Network connectivity issue detected.\n\nTroubleshooting steps:\n- Verify cluster endpoint accessibility\n- Run 'kubectl cluster-info' to test connectivity\n- Check network and firewall settings\n- Confirm cluster is running\n\nOriginal error: ${message}`;
  }

  private static enhanceAuthenticationError(message: string): string {
    if (message.includes('invalid bearer token')) {
      return KUBERNETES_ERROR_TEMPLATES.AUTHENTICATION.INVALID_TOKEN(message);
    }

    if (message.includes('certificate')) {
      return KUBERNETES_ERROR_TEMPLATES.AUTHENTICATION.CERTIFICATE_FAILED(message);
    }

    if (message.includes('no Auth Provider found')) {
      return KUBERNETES_ERROR_TEMPLATES.AUTHENTICATION.PROVIDER_MISSING(message);
    }

    return KUBERNETES_ERROR_TEMPLATES.AUTHENTICATION.GENERIC_FAILED(message);
  }

  private static enhanceAuthorizationError(message: string): string {
    if (message.includes('customresourcedefinitions')) {
      return KUBERNETES_ERROR_TEMPLATES.AUTHORIZATION.CRD_PERMISSIONS(message);
    }

    if (message.includes('forbidden')) {
      return KUBERNETES_ERROR_TEMPLATES.AUTHORIZATION.FORBIDDEN(message);
    }

    return KUBERNETES_ERROR_TEMPLATES.AUTHORIZATION.PERMISSION_DENIED(message);
  }

  private static enhanceAPIAvailabilityError(message: string): string {
    if (message.includes('apps/v1beta1')) {
      return KUBERNETES_ERROR_TEMPLATES.API.VERSION_UNSUPPORTED(message);
    }

    return KUBERNETES_ERROR_TEMPLATES.API.RESOURCE_UNAVAILABLE(message);
  }

  private static enhanceKubeconfigError(message: string): string {
    if (message.includes('context') && message.includes('does not exist')) {
      return KUBERNETES_ERROR_TEMPLATES.KUBECONFIG.CONTEXT_NOT_FOUND(message);
    }

    if (message.includes('not found')) {
      return KUBERNETES_ERROR_TEMPLATES.KUBECONFIG.FILE_NOT_FOUND(message);
    }

    return KUBERNETES_ERROR_TEMPLATES.KUBECONFIG.INVALID_FORMAT(message);
  }

  private static enhanceVersionCompatibilityError(message: string): string {
    return KUBERNETES_ERROR_TEMPLATES.VERSION_COMPATIBILITY(message);
  }
} 