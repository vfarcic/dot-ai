/**
 * kubectl_delete_dryrun tool
 *
 * Validate delete commands with dry-run before execution.
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

export const kubectlDeleteDryrun: KubectlTool = {
  definition: {
    name: 'kubectl_delete_dryrun',
    type: 'agentic',
    description:
      'Validate that a kubectl delete command will be accepted by the cluster without actually deleting resources. Use this to test resource deletion before completing investigation.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description:
            'Resource to delete (e.g., "pod/my-pod", "deployment/my-app", "configmap/my-config")',
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
    const resource = requireParam<string>(args, 'resource', 'kubectl_delete_dryrun');
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);

    const cmdArgs = ['delete', resource, '--dry-run=server'];

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    try {
      const output = await executeKubectl(cmdArgs);
      const nsMessage = namespace ? ` in namespace ${namespace}` : '';
      return successResult(output, `Dry-run validation successful for delete on ${resource}${nsMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Dry-run delete failed: ${message}`);
    }
  }),
};
