/**
 * Base utilities for kubectl tools
 *
 * Provides common types, validation, and kubectl execution for all tool implementations.
 */

import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolDefinition } from '../types';

const execAsync = promisify(exec);

/**
 * Configuration for kubectl command execution
 */
export interface KubectlConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
  timeout?: number;
  stdin?: string;
}

/**
 * Result returned by tool handlers
 */
export interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
  message: string;
}

/**
 * Self-contained kubectl tool definition
 * Combines the tool definition (for describe hook) with its handler (for invoke hook)
 */
export interface KubectlTool {
  /** Tool definition for the describe hook */
  definition: ToolDefinition;
  /** Handler function for the invoke hook */
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Validation error thrown when required parameters are missing
 */
export class ValidationError extends Error {
  constructor(
    public readonly param: string,
    public readonly toolName: string
  ) {
    super(`${toolName} requires parameter: ${param}`);
    this.name = 'ValidationError';
  }
}

/**
 * Require a parameter, throwing ValidationError if missing
 */
export function requireParam<T>(
  args: Record<string, unknown>,
  param: string,
  toolName: string
): T {
  const value = args[param];
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(param, toolName);
  }
  return value as T;
}

/**
 * Get an optional parameter with a default value
 */
export function optionalParam<T>(
  args: Record<string, unknown>,
  param: string,
  defaultValue: T
): T {
  const value = args[param];
  if (value === undefined || value === null) {
    return defaultValue;
  }
  return value as T;
}

/**
 * Safely escape shell arguments to prevent command injection
 */
export function escapeShellArg(arg: string): string {
  if (!arg || typeof arg !== 'string') {
    return '""';
  }

  // If the argument contains only safe characters, return as-is
  if (/^[a-zA-Z0-9._/:=-]+$/.test(arg)) {
    return arg;
  }

  // Otherwise, quote and escape
  return `"${arg.replace(/["\\]/g, '\\$&')}"`;
}

/**
 * Build kubectl command string with proper flags
 */
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

  args.forEach(arg => cmdParts.push(escapeShellArg(arg)));

  return cmdParts.join(' ');
}

/**
 * Execute a kubectl command
 *
 * @param args - Array of kubectl arguments (e.g., ['get', 'pods'])
 * @param config - Optional configuration (kubeconfig, context, namespace, timeout, stdin)
 * @returns Command output as string
 * @throws Error if command fails
 */
export async function executeKubectl(args: string[], config?: KubectlConfig): Promise<string> {
  const command = buildKubectlCommand(args, config);
  const timeout = config?.timeout || 30000;

  // If stdin is provided, use spawn for proper stdin piping
  if (config?.stdin) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn('sh', ['-c', command], {
        timeout,
      });

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error: Error) => reject(error));

      proc.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(`kubectl command failed: ${stderr || stdout}`));
        } else if (stderr && !isIgnorableStderr(stderr)) {
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
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large clusters
    });

    if (stderr && !isIgnorableStderr(stderr)) {
      throw new Error(`kubectl command failed: ${stderr}`);
    }

    return stdout.trim();
  } catch (error: unknown) {
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('kubectl binary not found. Please install kubectl and ensure it\'s in your PATH.');
      }
      throw error;
    }
    throw new Error(String(error));
  }
}

/**
 * Check if stderr output can be safely ignored
 */
function isIgnorableStderr(stderr: string): boolean {
  const ignorable = ['Warning', 'No resources found'];
  return ignorable.some(s => stderr.includes(s));
}

/**
 * Create a successful tool result
 */
export function successResult(data: string, message: string): ToolResult {
  return { success: true, data, message };
}

/**
 * Create an error tool result
 */
export function errorResult(error: string, message: string): ToolResult {
  return { success: false, error, message };
}

/**
 * Wrap a tool handler to catch ValidationError and return proper error results
 */
export function withValidation(
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
): (args: Record<string, unknown>) => Promise<ToolResult> {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof ValidationError) {
        return errorResult(
          `Missing required parameter: ${error.param}`,
          `${error.toolName} requires parameter: ${error.param}`
        );
      }
      throw error;
    }
  };
}

/**
 * Filter out output format args from kubectl arguments
 * Used by kubectl_get to enforce table format
 */
export function stripOutputFormatArgs(args: string[]): string[] {
  return args.filter(arg => {
    const argLower = arg.toLowerCase();
    return (
      !argLower.startsWith('-o=') &&
      !argLower.startsWith('-o') &&
      !argLower.startsWith('--output') &&
      !argLower.includes('=json') &&
      !argLower.includes('=yaml')
    );
  });
}

/**
 * Configuration for helm command execution
 */
export interface HelmConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
  timeout?: number;
  stdin?: string;
}

/**
 * Build helm command string with proper flags
 */
export function buildHelmCommand(args: string[], config?: HelmConfig): string {
  const cmdParts = ['helm'];

  if (config?.kubeconfig) {
    cmdParts.push('--kubeconfig', escapeShellArg(config.kubeconfig));
  }

  if (config?.context) {
    cmdParts.push('--kube-context', escapeShellArg(config.context));
  }

  if (config?.namespace) {
    cmdParts.push('--namespace', escapeShellArg(config.namespace));
  }

  args.forEach(arg => cmdParts.push(escapeShellArg(arg)));

  return cmdParts.join(' ');
}

/**
 * Execute a helm command
 *
 * @param args - Array of helm arguments (e.g., ['install', 'my-release', 'repo/chart'])
 * @param config - Optional configuration (kubeconfig, context, namespace, timeout, stdin)
 * @returns Command output as string
 * @throws Error if command fails
 */
export async function executeHelm(args: string[], config?: HelmConfig): Promise<string> {
  const command = buildHelmCommand(args, config);
  const timeout = config?.timeout || 60000; // 60s default for helm operations

  // If stdin is provided (for values), use spawn for proper stdin piping
  if (config?.stdin) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn('sh', ['-c', command], {
        timeout,
      });

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error: Error) => reject(error));

      proc.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(`helm command failed: ${stderr || stdout}`));
        } else if (stderr && !isIgnorableHelmStderr(stderr)) {
          reject(new Error(`helm command failed: ${stderr}`));
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
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });

    if (stderr && !isIgnorableHelmStderr(stderr)) {
      throw new Error(`helm command failed: ${stderr}`);
    }

    return stdout.trim();
  } catch (error: unknown) {
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('helm binary not found. Please install helm and ensure it\'s in your PATH.');
      }
      throw error;
    }
    throw new Error(String(error));
  }
}

/**
 * Check if stderr output from helm can be safely ignored
 */
function isIgnorableHelmStderr(stderr: string): boolean {
  const ignorable = [
    'Warning',
    'has been deprecated',
    'coalesce.go', // Helm internal warnings
    '"helm repo add" is not needed', // When repo already exists
  ];
  return ignorable.some(s => stderr.includes(s));
}
