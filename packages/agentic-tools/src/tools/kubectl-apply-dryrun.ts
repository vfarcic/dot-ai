/**
 * kubectl_apply_dryrun tool
 *
 * Validate apply commands with dry-run before execution.
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

export const kubectlApplyDryrun: KubectlTool = {
  definition: {
    name: 'kubectl_apply_dryrun',
    type: 'agentic',
    description:
      'Validate that a kubectl apply command will be accepted by the cluster without actually applying it. Use this to test applying YAML manifests or configuration changes before completing investigation.',
    inputSchema: {
      type: 'object',
      properties: {
        manifest: {
          type: 'string',
          description: 'The YAML manifest content to apply',
        },
        namespace: {
          type: 'string',
          description:
            'Kubernetes namespace for the resource. Omit for cluster-scoped resources or if namespace is specified in manifest.',
        },
      },
      required: ['manifest'],
    },
  },

  handler: withValidation(async (args) => {
    const manifest = requireParam<string>(args, 'manifest', 'kubectl_apply_dryrun');
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);

    const cmdArgs = ['apply', '--dry-run=server', '-f', '-'];

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    try {
      const output = await executeKubectl(cmdArgs, { stdin: manifest });
      const nsMessage = namespace ? ` in namespace ${namespace}` : '';
      return successResult(output, `Dry-run validation successful for apply${nsMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Dry-run apply failed: ${message}`);
    }
  }),
};
