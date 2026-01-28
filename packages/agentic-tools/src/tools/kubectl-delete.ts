/**
 * kubectl_delete tool
 *
 * Execute kubectl delete to remove resources.
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

export const kubectlDelete: KubectlTool = {
  definition: {
    name: 'kubectl_delete',
    type: 'agentic',
    description:
      'Delete Kubernetes resources by kind and name, or from a YAML manifest. This executes the actual delete command (not dry-run). Use kubectl_delete_dryrun first to validate.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: 'Resource kind (e.g., Pod, Deployment, Service). Required if manifest is not provided.',
        },
        name: {
          type: 'string',
          description: 'Resource name. Required if manifest is not provided.',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace for the resource. Omit for cluster-scoped resources.',
        },
        manifest: {
          type: 'string',
          description: 'YAML manifest of resources to delete. If provided, kind and name are ignored.',
        },
      },
      required: [],
    },
  },

  handler: withValidation(async (args) => {
    const kind = optionalParam<string | undefined>(args, 'kind', undefined);
    const name = optionalParam<string | undefined>(args, 'name', undefined);
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);
    const manifest = optionalParam<string | undefined>(args, 'manifest', undefined);

    let cmdArgs: string[];
    let stdinInput: string | undefined;

    if (manifest) {
      // Delete from manifest
      cmdArgs = ['delete', '-f', '-'];
      stdinInput = manifest;
    } else if (kind && name) {
      // Delete by kind and name
      cmdArgs = ['delete', kind, name];
    } else {
      return errorResult(
        'Missing required parameters',
        'kubectl_delete requires either manifest OR (kind and name)'
      );
    }

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    try {
      const output = await executeKubectl(cmdArgs, stdinInput ? { stdin: stdinInput } : undefined);
      const resourceDesc = manifest ? 'resources from manifest' : `${kind}/${name}`;
      const nsMessage = namespace ? ` in namespace ${namespace}` : '';
      return successResult(output, `Successfully deleted ${resourceDesc}${nsMessage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Delete failed: ${message}`);
    }
  }),
};
