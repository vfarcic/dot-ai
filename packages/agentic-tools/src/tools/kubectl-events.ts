/**
 * kubectl_events tool
 *
 * Get Kubernetes events for troubleshooting.
 */

import {
  KubectlTool,
  executeKubectl,
  successResult,
  errorResult,
  optionalParam,
} from './base';

export const kubectlEvents: KubectlTool = {
  definition: {
    name: 'kubectl_events',
    type: 'agentic',
    description:
      'Get Kubernetes events which record important state changes, errors, warnings, and informational messages from the cluster. Essential for understanding scheduling issues, resource problems, configuration errors, and system-level events affecting resources.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace to get events from. Omit for cluster-wide events.',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Additional event arguments (e.g., ["--sort-by=.lastTimestamp"] to sort by time, ["--field-selector=involvedObject.name=my-pod"] to filter by resource, ["--since=10m"] for recent events).',
        },
      },
      required: [],
    },
  },

  handler: async (args) => {
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);
    const extraArgs = optionalParam<string[]>(args, 'args', []);

    const cmdArgs = ['get', 'events'];

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    cmdArgs.push(...extraArgs);

    try {
      const output = await executeKubectl(cmdArgs);
      const nsMessage = namespace ? ` in namespace ${namespace}` : ' (cluster-wide)';
      return successResult(output, `Successfully retrieved events${nsMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get events: ${message}`);
    }
  },
};
