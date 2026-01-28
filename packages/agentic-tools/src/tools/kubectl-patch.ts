/**
 * kubectl_patch tool
 *
 * Execute kubectl patch to update resources.
 * PRD #343: Actual command execution (not dry-run) for remediation actions.
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

export const kubectlPatch: KubectlTool = {
  definition: {
    name: 'kubectl_patch',
    type: 'agentic',
    description:
      'Patch a Kubernetes resource using strategic merge patch, JSON merge patch, or JSON patch. This executes the actual patch command (not dry-run). Use kubectl_patch_dryrun first to validate.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: 'Resource kind (e.g., Deployment, Service)',
        },
        name: {
          type: 'string',
          description: 'Resource name',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace for the resource. Omit for cluster-scoped resources.',
        },
        patch: {
          type: 'string',
          description: 'The patch content as JSON or YAML string',
        },
        patchType: {
          type: 'string',
          enum: ['strategic', 'merge', 'json'],
          description: 'Patch type: strategic (default), merge, or json',
        },
      },
      required: ['kind', 'name', 'patch'],
    },
  },

  handler: withValidation(async (args) => {
    const kind = requireParam<string>(args, 'kind', 'kubectl_patch');
    const name = requireParam<string>(args, 'name', 'kubectl_patch');
    const patch = requireParam<string>(args, 'patch', 'kubectl_patch');
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);
    const patchType = optionalParam<string>(args, 'patchType', 'strategic');

    const cmdArgs = ['patch', kind, name, '--patch', patch];

    // Map patch type to kubectl flag
    const patchTypeFlag =
      patchType === 'json' ? 'json' : patchType === 'merge' ? 'merge' : 'strategic';
    cmdArgs.push('--type', patchTypeFlag);

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    try {
      const output = await executeKubectl(cmdArgs);
      const nsMessage = namespace ? ` in namespace ${namespace}` : '';
      return successResult(output, `Successfully patched ${kind}/${name}${nsMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Patch failed: ${message}`);
    }
  }),
};
