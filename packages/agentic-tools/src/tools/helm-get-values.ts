/**
 * helm_get_values tool
 *
 * Get current custom values for a Helm release.
 * PRD #251: Helm Day-2 operations - investigation tools.
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

export const helmGetValues: KubectlTool = {
  definition: {
    name: 'helm_get_values',
    type: 'agentic',
    description:
      'Get current custom values for a Helm release. Shows user-supplied values by default, or all computed values with the allValues flag. Use to understand current configuration before upgrades or modifications.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release to get values for',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace where the release is installed (default: "default")',
        },
        allValues: {
          type: 'boolean',
          description: 'If true, returns all computed values (user-supplied + defaults). Default: false (user-supplied only)',
        },
        revision: {
          type: 'number',
          description: 'Get values for a specific revision number (optional, defaults to latest)',
        },
      },
      required: ['releaseName'],
    },
  },

  handler: withValidation(async (args) => {
    const releaseName = requireParam<string>(args, 'releaseName', 'helm_get_values');
    const namespace = optionalParam<string>(args, 'namespace', 'default');
    const allValues = optionalParam<boolean>(args, 'allValues', false);
    const revision = optionalParam<number | undefined>(args, 'revision', undefined);

    const cmdArgs = ['get', 'values', releaseName, '-o', 'json'];

    if (allValues) {
      cmdArgs.push('-a');
    }

    if (revision !== undefined && revision > 0) {
      cmdArgs.push('--revision', String(revision));
    }

    try {
      const output = await executeHelm(cmdArgs, {
        namespace,
        timeout: 30000,
      });

      const valueType = allValues ? 'all computed' : 'user-supplied';
      return successResult(
        output,
        `Retrieved ${valueType} values for release "${releaseName}"`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get values for release "${releaseName}": ${message}`);
    }
  }),
};
