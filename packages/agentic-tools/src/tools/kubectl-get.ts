/**
 * kubectl_get tool
 *
 * Get Kubernetes resources with their current state in TABLE FORMAT.
 */

import {
  KubectlTool,
  executeKubectl,
  successResult,
  errorResult,
  requireParam,
  optionalParam,
  stripOutputFormatArgs,
  withValidation,
} from './base';

export const kubectlGet: KubectlTool = {
  definition: {
    name: 'kubectl_get',
    type: 'agentic',
    description:
      'Get Kubernetes resources and their current state in TABLE FORMAT (most efficient). Returns compact table with NAME, STATUS, READY, AGE columns. Use this to list resources and check basic status. For detailed information, use kubectl_describe instead. IMPORTANT: Always returns table format - output format flags like -o=yaml or -o=json are automatically stripped.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description:
            'Resource type to get (e.g., "pods", "deployments", "services", "pod/my-pod", "clusters.postgresql.cnpg.io"). Can be plural (pods) or singular with name (pod/name). Can include API group for custom resources.',
        },
        namespace: {
          type: 'string',
          description:
            'Kubernetes namespace to query. Omit for cluster-scoped resources or to query all namespaces.',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filtering arguments only (e.g., ["--selector=app=myapp"], ["--field-selector=status.phase=Running"], ["--all-namespaces"], ["--show-labels"]). Output format flags (-o=yaml, -o=json, etc.) are NOT allowed and will be automatically stripped.',
        },
      },
      required: ['resource'],
    },
  },

  handler: withValidation(async (args) => {
    const resource = requireParam<string>(args, 'resource', 'kubectl_get');
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);
    const extraArgs = optionalParam<string[]>(args, 'args', []);

    const cmdArgs = ['get', resource];

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    // Strip output format args - we always return table format for efficiency
    const filteredArgs = stripOutputFormatArgs(extraArgs);
    cmdArgs.push(...filteredArgs);

    try {
      const output = await executeKubectl(cmdArgs);
      const nsMessage = namespace ? ` in namespace ${namespace}` : '';
      return successResult(output, `Successfully retrieved ${resource}${nsMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get ${resource}: ${message}`);
    }
  }),
};
