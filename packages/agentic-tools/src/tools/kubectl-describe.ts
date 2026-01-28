/**
 * kubectl_describe tool
 *
 * Get detailed information about Kubernetes resources.
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

export const kubectlDescribe: KubectlTool = {
  definition: {
    name: 'kubectl_describe',
    type: 'agentic',
    description:
      'Get detailed information about specific Kubernetes resources including configuration, status, events, and relationships. Use this when you need comprehensive details about a specific resource, especially to understand configuration issues or see recent events related to that resource.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description:
            'Resource to describe (e.g., "pod/my-pod", "deployment/my-app", "cluster/postgres-db"). Should include the resource name.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace. Required for namespaced resources.',
        },
      },
      required: ['resource'],
    },
  },

  handler: withValidation(async (args) => {
    const resource = requireParam<string>(args, 'resource', 'kubectl_describe');
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);

    const cmdArgs = ['describe', resource];

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    try {
      const output = await executeKubectl(cmdArgs);
      const nsMessage = namespace ? ` in namespace ${namespace}` : '';
      return successResult(output, `Successfully described ${resource}${nsMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to describe ${resource}: ${message}`);
    }
  }),
};
