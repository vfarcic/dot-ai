/**
 * Shared Kubernetes Utilities
 * 
 * Common functions for interacting with Kubernetes clusters
 */

import { exec } from 'child_process';
import { promisify } from 'util';

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
 */
export async function executeKubectl(args: string[], config?: KubectlConfig): Promise<string> {
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
          } else if (stderr && !stderr.includes('Warning')) {
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
    if (stderr && !stderr.includes('Warning')) {
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
      return `Token may be expired: Bearer token authentication failed.\n\nTroubleshooting steps:\n- Token may be expired - refresh credentials\n- Check token format in kubeconfig\n- Re-authenticate with cluster: kubectl auth login\n- Verify service account token if applicable\n\nOriginal error: ${message}`;
    }

    if (message.includes('certificate')) {
      return `Certificate authentication failed: Client certificate validation error.\n\nTroubleshooting steps:\n- Verify certificate path in kubeconfig\n- Check certificate expiration date\n- Ensure certificate authority (CA) bundle is correct\n- Re-generate client certificates if needed\n\nOriginal error: ${message}`;
    }

    if (message.includes('no Auth Provider found')) {
      return `Authentication provider not available: Required auth plugin missing.\n\nTroubleshooting steps:\n- Install required authentication plugin (e.g., OIDC)\n- Check kubectl config for auth provider configuration\n- Verify authentication method compatibility\n- Consult cluster administrator for auth setup\n\nOriginal error: ${message}`;
    }

    return `Authentication failed: Invalid or missing credentials.\n\nTroubleshooting steps:\n- Verify credentials in kubeconfig\n- Re-authenticate with cluster\n- Check authentication method configuration\n- Contact cluster administrator if needed\n\nOriginal error: ${message}`;
  }

  private static enhanceAuthorizationError(message: string): string {
    if (message.includes('customresourcedefinitions')) {
      return `CRD discovery requires cluster-level permissions: Insufficient RBAC permissions.\n\nTroubleshooting steps:\n- CRD discovery requires admin privileges\n- Request cluster-admin role or CRD read permissions\n- Contact cluster administrator for permission escalation\n- Use 'kubectl auth can-i list customresourcedefinitions' to check permissions\n\nOriginal error: ${message}`;
    }

    if (message.includes('forbidden')) {
      return `Insufficient permissions: RBAC restrictions prevent this operation.\n\nTroubleshooting steps:\n- RBAC role required for resource access\n- Request appropriate permissions from cluster administrator\n- Check current permissions: kubectl auth can-i list <resource>\n- Consider using cluster-admin role for discovery operations\n\nOriginal error: ${message}`;
    }

    return `Permission denied: Insufficient RBAC permissions for cluster access.\n\nTroubleshooting steps:\n- Request appropriate RBAC permissions\n- Check current access: kubectl auth can-i list <resource>\n- Contact cluster administrator for role assignment\n- Verify service account permissions if applicable\n\nOriginal error: ${message}`;
  }

  private static enhanceAPIAvailabilityError(message: string): string {
    if (message.includes('apps/v1beta1')) {
      return `API version not supported: Cluster doesn't support requested API version.\n\nTroubleshooting steps:\n- Try different API version (e.g., apps/v1 instead of apps/v1beta1)\n- Check available API versions: kubectl api-versions\n- Verify Kubernetes cluster version compatibility\n- Consult API migration guides for version changes\n\nOriginal error: ${message}`;
    }

    return `API resource not available: Requested resource type not found in cluster.\n\nTroubleshooting steps:\n- Check available resources: kubectl api-resources\n- Verify cluster supports required resource types\n- Check Kubernetes version compatibility\n- Confirm cluster configuration and enabled APIs\n\nOriginal error: ${message}`;
  }

  private static enhanceKubeconfigError(message: string): string {
    if (message.includes('context') && message.includes('does not exist')) {
      return `Context not found: Specified context doesn't exist in kubeconfig.\n\nTroubleshooting steps:\n- List available contexts: kubectl config get-contexts\n- Set correct context: kubectl config use-context <context-name>\n- Verify kubeconfig file contains required context\n- Check context name spelling and case sensitivity\n\nOriginal error: ${message}`;
    }

    if (message.includes('not found')) {
      return `Kubeconfig file not found: Cannot locate configuration file.\n\nTroubleshooting steps:\n- Check file path exists and is accessible\n- Verify kubeconfig file permissions\n- Set KUBECONFIG environment variable if needed\n- Create kubeconfig file or copy from cluster administrator\n\nOriginal error: ${message}`;
    }

    return `Invalid kubeconfig format: Configuration file has syntax or format errors.\n\nTroubleshooting steps:\n- Validate YAML syntax in kubeconfig file\n- Check file structure: kubectl config view\n- Restore from backup or re-download from cluster\n- Verify all required sections (clusters, contexts, users)\n\nOriginal error: ${message}`;
  }

  private static enhanceVersionCompatibilityError(message: string): string {
    return `Kubernetes version compatibility issue: Version mismatch detected.\n\nTroubleshooting steps:\n- Check cluster and client versions: kubectl version\n- Verify supported Kubernetes versions for this tool\n- Update kubectl client if needed\n- Consult compatibility matrix for version support\n\nOriginal error: ${message}`;
  }
} 