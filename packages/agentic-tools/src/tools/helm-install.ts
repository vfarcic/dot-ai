/**
 * helm_install tool
 *
 * Install or upgrade a Helm release.
 * Supports dry-run for validation.
 * PRD #343: Helm operations via plugin system.
 */

import {
  KubectlTool,
  executeHelm,
  successResult,
  errorResult,
  requireParam,
  optionalParam,
  withValidation,
} from './base';

export const helmInstall: KubectlTool = {
  definition: {
    name: 'helm_install',
    type: 'agentic',
    description:
      'Install or upgrade a Helm chart. Uses "helm upgrade --install" for idempotent operations. Supports dry-run validation.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name for the Helm release (e.g., "my-prometheus")',
        },
        chart: {
          type: 'string',
          description: 'Chart reference (e.g., "prometheus-community/prometheus" or path to local chart)',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace to install into (default: "default")',
        },
        values: {
          type: 'string',
          description: 'YAML content for values.yaml override (optional)',
        },
        version: {
          type: 'string',
          description: 'Specific chart version to install (optional, uses latest if not specified)',
        },
        dryRun: {
          type: 'boolean',
          description: 'If true, performs a dry-run without actually installing (default: false)',
        },
        wait: {
          type: 'boolean',
          description: 'If true, waits for all resources to be ready (default: false)',
        },
        timeout: {
          type: 'string',
          description: 'Time to wait for operations (e.g., "5m", "300s"). Default: "5m"',
        },
        createNamespace: {
          type: 'boolean',
          description: 'If true, creates the namespace if it does not exist (default: true)',
        },
      },
      required: ['releaseName', 'chart'],
    },
  },

  handler: withValidation(async (args) => {
    const releaseName = requireParam<string>(args, 'releaseName', 'helm_install');
    const chart = requireParam<string>(args, 'chart', 'helm_install');
    const namespace = optionalParam<string>(args, 'namespace', 'default');
    const values = optionalParam<string | undefined>(args, 'values', undefined);
    const version = optionalParam<string | undefined>(args, 'version', undefined);
    const dryRun = optionalParam<boolean>(args, 'dryRun', false);
    const wait = optionalParam<boolean>(args, 'wait', false);
    const timeout = optionalParam<string>(args, 'timeout', '5m');
    const createNamespace = optionalParam<boolean>(args, 'createNamespace', true);

    const cmdArgs = ['upgrade', '--install', releaseName, chart];

    if (version) {
      cmdArgs.push('--version', version);
    }

    if (dryRun) {
      // Helm 4: --dry-run without value defaults to "none" (no dry-run!)
      // Must explicitly use --dry-run=client for simulation
      cmdArgs.push('--dry-run=client');
    }

    if (wait) {
      cmdArgs.push('--wait');
    }

    cmdArgs.push('--timeout', timeout);

    if (createNamespace) {
      cmdArgs.push('--create-namespace');
    }

    // If values provided, use stdin
    if (values) {
      cmdArgs.push('-f', '-');
    }

    try {
      const output = await executeHelm(cmdArgs, {
        namespace,
        stdin: values,
        timeout: 300000, // 5 minute timeout for helm operations
      });

      const action = dryRun ? 'validated (dry-run)' : 'installed/upgraded';
      return successResult(
        output,
        `Release "${releaseName}" ${action} successfully in namespace "${namespace}"`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Helm install failed: ${message}`);
    }
  }),
};
