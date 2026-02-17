/**
 * helm_status tool
 *
 * Get detailed status of a Helm release.
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

export const helmStatus: KubectlTool = {
  definition: {
    name: 'helm_status',
    type: 'agentic',
    description:
      'Get detailed status of a Helm release including deployment status, notes, and resource state. Use to check if a release is healthy or diagnose issues like stuck pending-upgrade states.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release to check status for',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace where the release is installed (default: "default")',
        },
      },
      required: ['releaseName'],
    },
  },

  handler: withValidation(async (args) => {
    const releaseName = requireParam<string>(args, 'releaseName', 'helm_status');
    const namespace = optionalParam<string>(args, 'namespace', 'default');

    const cmdArgs = ['status', releaseName, '-o', 'json'];

    try {
      const output = await executeHelm(cmdArgs, {
        namespace,
        timeout: 30000,
      });

      return successResult(
        output,
        `Status retrieved for release "${releaseName}" in namespace "${namespace}"`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get status for release "${releaseName}": ${message}`);
    }
  }),
};
