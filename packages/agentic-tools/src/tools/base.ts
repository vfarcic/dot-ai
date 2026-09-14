/**
 * Base utilities for kubectl tools
 *
 * Provides common types, validation, and kubectl execution for all tool implementations.
 */

import { spawn } from 'node:child_process';
import { ToolDefinition } from '../types';

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
 * POSIX-quote a string for display inside a shell command line.
 *
 * NOT part of any execution path — `executeKubectl`/`executeHelm` never build a
 * command line, they pass an argv array to `spawn` with no shell (see
 * `runWithoutShell`). This exists so the strings produced by
 * `buildKubectlCommand`/`buildHelmCommand` for logs and error messages are
 * copy-pasteable and unambiguous.
 *
 * Single quotes are used deliberately. The previous double-quoted form escaped
 * only `"` and `\`, which left `$(...)`, backticks and `\` live inside the
 * quotes; a single-quoted string has no interpolation at all, and the only
 * character needing care is `'` itself.
 */
export function escapeShellArg(arg: string): string {
  if (!arg || typeof arg !== 'string') {
    return "''";
  }

  // If the argument contains only safe characters, return as-is
  if (/^[a-zA-Z0-9._/:=-]+$/.test(arg)) {
    return arg;
  }

  // Close the quote, emit an escaped quote, reopen: 'it'\''s'
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the argv array kubectl is executed with.
 *
 * Every element is one `execve` argument. Nothing is concatenated and nothing
 * is quoted, because there is no shell to quote for.
 */
export function buildKubectlArgv(
  args: string[],
  config?: KubectlConfig
): string[] {
  const argv: string[] = [];

  if (config?.kubeconfig) {
    argv.push('--kubeconfig', config.kubeconfig);
  }

  if (config?.context) {
    argv.push('--context', config.context);
  }

  if (config?.namespace) {
    argv.push('--namespace', config.namespace);
  }

  return [...argv, ...args];
}

/**
 * Render the kubectl invocation as a command string — for logs, error messages
 * and dry-run display only.
 *
 * Nothing executes this. `executeKubectl` runs `buildKubectlArgv` through
 * `spawn` without a shell.
 */
export function buildKubectlCommand(
  args: string[],
  config?: KubectlConfig
): string {
  return [
    'kubectl',
    ...buildKubectlArgv(args, config).map(escapeShellArg),
  ].join(' ');
}

/** Cap on captured stdout, preserving the previous execAsync maxBuffer. */
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

interface RunOptions {
  /** Binary name used in error messages, e.g. 'kubectl'. */
  label: string;
  timeout: number;
  stdin?: string;
  isIgnorableStderr: (stderr: string) => boolean;
}

/**
 * Run a binary with an argv array and NO shell.
 *
 * `spawn(binary, argv)` hands `argv` straight to `execve`, so `$(...)`,
 * backticks, quotes, pipes, `;` and newlines inside an argument are literal
 * bytes the binary receives verbatim — there is no shell to interpret them.
 * This is the property the constrained remediation path (PRD #810) rests on:
 * model-authored `kind`/`name`/`namespace`/`patch` values travel as discrete
 * argv elements. Do not reintroduce `sh -c`, `exec()` or string concatenation
 * on this path.
 */
function runWithoutShell(
  binary: string,
  argv: string[],
  options: RunOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let settled = false;

    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      action();
    };

    const proc = spawn(binary, argv, { timeout: options.timeout });

    proc.stdout.on('data', (data: Buffer) => {
      stdoutBytes += data.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        proc.kill();
        settle(() =>
          reject(
            new Error(
              `${options.label} command failed: output exceeded ${MAX_OUTPUT_BYTES} bytes`
            )
          )
        );
        return;
      }
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (error: NodeJS.ErrnoException) => {
      settle(() => {
        if (error.code === 'ENOENT') {
          reject(
            new Error(
              `${binary} binary not found. Please install ${binary} and ensure it's in your PATH.`,
              { cause: error }
            )
          );
          return;
        }
        reject(error);
      });
    });

    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      settle(() => {
        if (code === null) {
          // Killed — spawn's own `timeout` is the only killer we set up.
          reject(
            new Error(
              `${options.label} command failed: terminated by ${signal} (timeout: ${options.timeout}ms)`
            )
          );
        } else if (code !== 0) {
          reject(
            new Error(`${options.label} command failed: ${stderr || stdout}`)
          );
        } else if (stderr && !options.isIgnorableStderr(stderr)) {
          reject(new Error(`${options.label} command failed: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      });
    });

    // The child can exit before reading everything we write (a rejected
    // manifest, say), which surfaces as EPIPE on this stream. The real failure
    // is already on its way through 'close', so do not let EPIPE become an
    // unhandled error event.
    proc.stdin.on('error', () => {});

    if (options.stdin !== undefined) {
      proc.stdin.write(options.stdin);
    }
    proc.stdin.end();
  });
}

/**
 * Execute a kubectl command
 *
 * @param args - Array of kubectl arguments (e.g., ['get', 'pods'])
 * @param config - Optional configuration (kubeconfig, context, namespace, timeout, stdin)
 * @returns Command output as string
 * @throws Error if command fails
 */
export async function executeKubectl(
  args: string[],
  config?: KubectlConfig
): Promise<string> {
  return runWithoutShell('kubectl', buildKubectlArgv(args, config), {
    label: 'kubectl',
    timeout: config?.timeout || 30000,
    stdin: config?.stdin,
    isIgnorableStderr,
  });
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
 * Build the argv array helm is executed with. One element per `execve`
 * argument; no shell, so nothing needs quoting.
 */
export function buildHelmArgv(args: string[], config?: HelmConfig): string[] {
  const argv: string[] = [];

  if (config?.kubeconfig) {
    argv.push('--kubeconfig', config.kubeconfig);
  }

  if (config?.context) {
    argv.push('--kube-context', config.context);
  }

  if (config?.namespace) {
    argv.push('--namespace', config.namespace);
  }

  return [...argv, ...args];
}

/**
 * Render the helm invocation as a command string — for logs and error messages
 * only. Nothing executes this; see `buildKubectlCommand`.
 */
export function buildHelmCommand(args: string[], config?: HelmConfig): string {
  return ['helm', ...buildHelmArgv(args, config).map(escapeShellArg)].join(' ');
}

/**
 * Execute a helm command
 *
 * @param args - Array of helm arguments (e.g., ['install', 'my-release', 'repo/chart'])
 * @param config - Optional configuration (kubeconfig, context, namespace, timeout, stdin)
 * @returns Command output as string
 * @throws Error if command fails
 */
export async function executeHelm(
  args: string[],
  config?: HelmConfig
): Promise<string> {
  return runWithoutShell('helm', buildHelmArgv(args, config), {
    label: 'helm',
    timeout: config?.timeout || 60000, // 60s default for helm operations
    stdin: config?.stdin,
    isIgnorableStderr: isIgnorableHelmStderr,
  });
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
