/**
 * kubectl_version tool
 *
 * Get Kubernetes client and server version information as JSON.
 */

import {
  KubectlTool,
  executeKubectl,
  successResult,
  errorResult,
} from './base';

export const kubectlVersion: KubectlTool = {
  definition: {
    name: 'kubectl_version',
    type: 'agentic',
    description:
      'Get Kubernetes client and server version information. Returns JSON with clientVersion and serverVersion objects containing gitVersion, platform, goVersion, and other version details.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  handler: async () => {
    try {
      const output = await executeKubectl(['version', '--output=json']);
      return successResult(output, 'Successfully retrieved Kubernetes version');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get Kubernetes version: ${message}`);
    }
  },
};
