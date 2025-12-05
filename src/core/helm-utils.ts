/**
 * Helm Utilities - Shared functions for Helm chart operations
 */

import * as path from 'path';
import * as fs from 'fs';
import { HelmChartInfo } from './helm-types';
import { execAsync } from './platform-utils';

/**
 * Sanitize input for safe shell command usage.
 * Validates that input contains only safe characters to prevent command injection.
 * @throws Error if input contains potentially dangerous characters
 */
export function sanitizeShellArg(arg: string, fieldName: string = 'argument'): string {
  // Allow alphanumeric, dash, underscore, dot, forward slash, colon (for URLs), and @ (for versions)
  // This covers valid Helm chart names, repo names, URLs, and version strings
  if (!/^[a-zA-Z0-9\-_./:\\@]+$/.test(arg)) {
    throw new Error(`Invalid characters in ${fieldName}: "${arg}". Only alphanumeric characters, dashes, underscores, dots, forward slashes, colons, and @ are allowed.`);
  }
  return arg;
}

/**
 * Validate and sanitize HelmChartInfo for safe shell command usage
 */
export function sanitizeChartInfo(chart: HelmChartInfo): {
  repositoryName: string;
  repository: string;
  chartName: string;
  version?: string;
} {
  return {
    repositoryName: sanitizeShellArg(chart.repositoryName, 'repository name'),
    repository: sanitizeShellArg(chart.repository, 'repository URL'),
    chartName: sanitizeShellArg(chart.chartName, 'chart name'),
    version: chart.version ? sanitizeShellArg(chart.version, 'version') : undefined
  };
}

/**
 * Build the Helm command from chart info and deployment options
 */
export function buildHelmCommand(
  chart: HelmChartInfo,
  releaseName: string,
  namespace: string,
  valuesPath?: string
): string {
  // Sanitize all inputs to prevent command injection
  const safeChart = sanitizeChartInfo(chart);
  const safeReleaseName = sanitizeShellArg(releaseName, 'release name');
  const safeNamespace = sanitizeShellArg(namespace, 'namespace');

  const parts = [
    'helm upgrade --install',
    safeReleaseName,
    `${safeChart.repositoryName}/${safeChart.chartName}`,
    `--namespace ${safeNamespace}`,
    '--create-namespace'
  ];

  if (safeChart.version) {
    parts.push(`--version ${safeChart.version}`);
  }

  if (valuesPath) {
    // Values path is internally generated, but sanitize anyway
    parts.push(`-f ${sanitizeShellArg(valuesPath, 'values path')}`);
  }

  return parts.join(' ');
}

/**
 * Ensure Helm repository is added and updated
 */
export async function ensureHelmRepo(chart: HelmChartInfo): Promise<void> {
  // Sanitize chart info to prevent command injection
  const safeChart = sanitizeChartInfo(chart);
  await execAsync(`helm repo add ${safeChart.repositoryName} ${safeChart.repository} 2>/dev/null || true`);
  await execAsync('helm repo update 2>/dev/null || true');
}

/**
 * Execute a Helm command with proper error handling
 */
export async function executeHelmCommand(
  command: string,
  options?: {
    timeout?: number;
    maxBuffer?: number;
  }
): Promise<{ stdout: string; stderr: string }> {
  const execOptions = {
    maxBuffer: options?.maxBuffer || 10 * 1024 * 1024,
    timeout: options?.timeout
  };

  return await execAsync(command, execOptions);
}

/**
 * Get the path for Helm values file
 */
export function getHelmValuesPath(solutionId: string): string {
  const tmpDir = path.join(process.cwd(), 'tmp');
  return path.join(tmpDir, `${solutionId}-values.yaml`);
}

/**
 * Check if Helm values file exists for a solution
 */
export function helmValuesExist(solutionId: string): boolean {
  return fs.existsSync(getHelmValuesPath(solutionId));
}

/**
 * Ensure tmp directory exists
 */
export function ensureTmpDir(): string {
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  return tmpDir;
}

/**
 * Result of Helm command execution
 */
export interface HelmExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Run Helm dry-run validation
 */
export async function validateHelmDryRun(
  chart: HelmChartInfo,
  releaseName: string,
  namespace: string,
  valuesPath: string
): Promise<HelmExecutionResult> {
  try {
    await ensureHelmRepo(chart);

    const dryRunCommand = buildHelmCommand(chart, releaseName, namespace, valuesPath) + ' --dry-run';
    const { stdout, stderr } = await executeHelmCommand(dryRunCommand);

    return {
      success: true,
      output: stdout + (stderr ? `\n${stderr}` : '')
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let cleanError = errorMessage;

    if (error instanceof Error && 'stderr' in error) {
      cleanError = (error as any).stderr || errorMessage;
    }

    return {
      success: false,
      output: '',
      error: cleanError
    };
  }
}

/**
 * Deploy a Helm chart
 */
export async function deployHelmRelease(
  chart: HelmChartInfo,
  releaseName: string,
  namespace: string,
  valuesPath: string | undefined,
  timeout: number
): Promise<HelmExecutionResult> {
  try {
    await ensureHelmRepo(chart);

    const helmCommand = buildHelmCommand(chart, releaseName, namespace, valuesPath) +
      ` --timeout ${timeout}s --wait`;

    const { stdout, stderr } = await executeHelmCommand(helmCommand, {
      timeout: (timeout + 30) * 1000 // Add buffer for command overhead
    });

    return {
      success: true,
      output: stdout + (stderr ? `\n\nStderr:\n${stderr}` : '')
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    let cleanError = errorMessage;

    if (error instanceof Error && 'stderr' in error) {
      cleanError = (error as any).stderr || errorMessage;
    }

    return {
      success: false,
      output: '',
      error: cleanError
    };
  }
}
