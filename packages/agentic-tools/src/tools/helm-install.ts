/**
 * helm_install and helm_install_dryrun tools
 *
 * Install or upgrade a Helm release.
 * PRD #343: Helm operations via plugin system.
 * PRD #251: Helm Day-2 operations - dry-run variant for operate analysis.
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

interface HelmInstallParams {
  releaseName: string;
  chart: string;
  namespace: string;
  version?: string;
  values?: string;
  dryRun: boolean;
  wait: boolean;
  timeout: string;
  createNamespace: boolean;
}

function buildAndExecuteHelmInstall(params: HelmInstallParams) {
  const { releaseName, chart, namespace, version, values, dryRun, wait, timeout, createNamespace } = params;

  const cmdArgs = ['upgrade', '--install', '--reuse-values', releaseName, chart];

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

  if (values) {
    cmdArgs.push('-f', '-');
  }

  return executeHelm(cmdArgs, {
    namespace,
    stdin: values,
    timeout: 300000,
  });
}

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
    const dryRun = optionalParam<boolean>(args, 'dryRun', false);

    try {
      const output = await buildAndExecuteHelmInstall({
        releaseName,
        chart,
        namespace: optionalParam<string>(args, 'namespace', 'default'),
        version: optionalParam<string | undefined>(args, 'version', undefined),
        values: optionalParam<string | undefined>(args, 'values', undefined),
        dryRun,
        wait: optionalParam<boolean>(args, 'wait', false),
        timeout: optionalParam<string>(args, 'timeout', '5m'),
        createNamespace: optionalParam<boolean>(args, 'createNamespace', true),
      });

      const action = dryRun ? 'validated (dry-run)' : 'installed/upgraded';
      return successResult(
        output,
        `Release "${releaseName}" ${action} successfully in namespace "${optionalParam<string>(args, 'namespace', 'default')}"`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Helm install failed: ${message}`);
    }
  }),
};

export const helmInstallDryrun: KubectlTool = {
  definition: {
    name: 'helm_install_dryrun',
    type: 'agentic',
    description:
      'Validate that a Helm install or upgrade will succeed without actually executing it. Always runs in dry-run mode. Use to verify chart versions, value overrides, and release configuration before proposing changes.',
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
          description: 'Kubernetes namespace for the release (default: "default")',
        },
        version: {
          type: 'string',
          description: 'Specific chart version to validate (optional, uses latest if not specified)',
        },
        values: {
          type: 'string',
          description: 'YAML content for values.yaml override (optional)',
        },
      },
      required: ['releaseName', 'chart'],
    },
  },

  handler: withValidation(async (args) => {
    const releaseName = requireParam<string>(args, 'releaseName', 'helm_install_dryrun');
    const chart = requireParam<string>(args, 'chart', 'helm_install_dryrun');
    const namespace = optionalParam<string>(args, 'namespace', 'default');

    try {
      const output = await buildAndExecuteHelmInstall({
        releaseName,
        chart,
        namespace,
        version: optionalParam<string | undefined>(args, 'version', undefined),
        values: optionalParam<string | undefined>(args, 'values', undefined),
        dryRun: true,
        wait: false,
        timeout: '5m',
        createNamespace: false,
      });

      return successResult(
        output,
        `Dry-run validation successful for release "${releaseName}" in namespace "${namespace}"`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Helm dry-run validation failed: ${message}`);
    }
  }),
};
