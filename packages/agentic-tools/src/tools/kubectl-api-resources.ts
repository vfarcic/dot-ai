/**
 * kubectl_api_resources tool
 *
 * Get list of all available Kubernetes API resources in the cluster.
 */

import {
  KubectlTool,
  executeKubectl,
  successResult,
  errorResult,
} from './base';

export const kubectlApiResources: KubectlTool = {
  definition: {
    name: 'kubectl_api_resources',
    type: 'agentic',
    description:
      'Get list of all available Kubernetes API resources in the cluster (resource types, API groups, namespaced vs cluster-scoped). Use this to discover what resources are available before querying specific resources. Essential for understanding what can be investigated in this cluster.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  handler: async () => {
    try {
      const output = await executeKubectl(['api-resources']);
      return successResult(output, 'Successfully retrieved cluster API resources');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get API resources: ${message}`);
    }
  },
};
