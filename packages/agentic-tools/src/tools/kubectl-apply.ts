/**
 * kubectl_apply tool
 *
 * Execute kubectl apply to create or update resources.
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

export const kubectlApply: KubectlTool = {
  definition: {
    name: 'kubectl_apply',
    type: 'agentic',
    description:
      'Apply a YAML manifest to create or update Kubernetes resources. This executes the actual apply command (not dry-run). Use kubectl_apply_dryrun first to validate.',
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
    const manifest = requireParam<string>(args, 'manifest', 'kubectl_apply');
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);

    const cmdArgs = ['apply', '-f', '-'];

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    try {
      const output = await executeKubectl(cmdArgs, { stdin: manifest });
      const nsMessage = namespace ? ` in namespace ${namespace}` : '';
      return successResult(output, `Successfully applied manifest${nsMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Apply failed: ${message}`);
    }
  }),
};
