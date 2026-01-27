/**
 * helm_uninstall tool
 *
 * Uninstall a Helm release.
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

export const helmUninstall: KubectlTool = {
  definition: {
    name: 'helm_uninstall',
    type: 'agentic',
    description:
      'Uninstall a Helm release and remove all associated Kubernetes resources.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release to uninstall',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace where the release is installed (default: "default")',
        },
        wait: {
          type: 'boolean',
          description: 'If true, waits for all resources to be deleted (default: false)',
        },
        timeout: {
          type: 'string',
          description: 'Time to wait for uninstall (e.g., "5m", "300s"). Default: "5m"',
        },
      },
      required: ['releaseName'],
    },
  },

  handler: withValidation(async (args) => {
    const releaseName = requireParam<string>(args, 'releaseName', 'helm_uninstall');
    const namespace = optionalParam<string>(args, 'namespace', 'default');
    const wait = optionalParam<boolean>(args, 'wait', false);
    const timeout = optionalParam<string>(args, 'timeout', '5m');

    const cmdArgs = ['uninstall', releaseName];

    if (wait) {
      cmdArgs.push('--wait');
    }

    cmdArgs.push('--timeout', timeout);

    try {
      const output = await executeHelm(cmdArgs, {
        namespace,
        timeout: 300000, // 5 minute timeout
      });

      return successResult(
        output,
        `Release "${releaseName}" uninstalled from namespace "${namespace}"`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Helm uninstall failed: ${message}`);
    }
  }),
};
