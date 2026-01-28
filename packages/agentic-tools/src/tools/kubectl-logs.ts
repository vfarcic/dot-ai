/**
 * kubectl_logs tool
 *
 * Get container logs from pods.
 */

import {
  KubectlTool,
  executeKubectl,
  successResult,
  errorResult,
  requireParam,
  optionalParam,
  withValidation,
} from './base';

export const kubectlLogs: KubectlTool = {
  definition: {
    name: 'kubectl_logs',
    type: 'agentic',
    description:
      'Get container logs from pods. Essential for debugging application crashes, errors, and understanding runtime behavior. Use --previous flag to get logs from crashed/restarted containers.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Pod name to get logs from (e.g., "my-pod" or "pod/my-pod").',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace where the pod is running.',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Additional log arguments (e.g., ["--previous"] for crashed container logs, ["--tail=50"] to limit output, ["--since=5m"] for recent logs, ["-c", "container-name"] for specific container).',
        },
      },
      required: ['resource', 'namespace'],
    },
  },

  handler: withValidation(async (args) => {
    const resource = requireParam<string>(args, 'resource', 'kubectl_logs');
    const namespace = requireParam<string>(args, 'namespace', 'kubectl_logs');
    const extraArgs = optionalParam<string[]>(args, 'args', []);

    const cmdArgs = ['logs', resource, '-n', namespace];
    cmdArgs.push(...extraArgs);

    try {
      const output = await executeKubectl(cmdArgs);
      return successResult(output, `Successfully retrieved logs for ${resource} in namespace ${namespace}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get logs for ${resource}: ${message}`);
    }
  }),
};
