/**
 * kubectl_patch_dryrun tool
 *
 * Validate patch commands with dry-run before execution.
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

export const kubectlPatchDryrun: KubectlTool = {
  definition: {
    name: 'kubectl_patch_dryrun',
    type: 'agentic',
    description:
      'Validate that a kubectl patch command will be accepted by the cluster without actually applying it. Use this to test your proposed remediation patches before completing investigation. Essential for confirming command syntax and cluster acceptance.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description:
            'Resource to patch (e.g., "deployment/my-app", "cluster/postgres-db"). Must include resource type and name.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace. Required for namespaced resources.',
        },
        patch: {
          type: 'string',
          description: 'The patch content in JSON format (e.g., \'{"spec":{"replicas":3}}\')',
        },
        patchType: {
          type: 'string',
          description:
            'Type of patch: "strategic" (default), "merge", or "json". Use "json" for JSON Patch operations.',
        },
      },
      required: ['resource', 'patch'],
    },
  },

  handler: withValidation(async (args) => {
    const resource = requireParam<string>(args, 'resource', 'kubectl_patch_dryrun');
    const patch = requireParam<string>(args, 'patch', 'kubectl_patch_dryrun');
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);
    const patchType = optionalParam<string>(args, 'patchType', 'strategic');

    const cmdArgs = ['patch', resource, '--dry-run=server'];

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    // Add patch type flag
    if (patchType === 'json') {
      cmdArgs.push('--type=json');
    } else if (patchType === 'merge') {
      cmdArgs.push('--type=merge');
    }
    // strategic is default, no flag needed

    cmdArgs.push('-p', patch);

    try {
      const output = await executeKubectl(cmdArgs);
      const nsMessage = namespace ? ` in namespace ${namespace}` : '';
      return successResult(output, `Dry-run validation successful for patch on ${resource}${nsMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Dry-run patch failed: ${message}`);
    }
  }),
};
