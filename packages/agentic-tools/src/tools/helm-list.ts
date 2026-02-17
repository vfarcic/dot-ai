/**
 * helm_list tool
 *
 * List all Helm releases in the cluster.
 * PRD #251: Helm Day-2 operations - investigation tools.
 */

import {
  KubectlTool,
  executeHelm,
  successResult,
  errorResult,
  optionalParam,
  withValidation,
} from './base';

export const helmList: KubectlTool = {
  definition: {
    name: 'helm_list',
    type: 'agentic',
    description:
      'List all Helm releases in the cluster. Returns release name, namespace, chart, version, status, and last updated time. Use to discover what Helm releases exist before performing operations.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: 'Namespace to list releases from. Omit for all namespaces.',
        },
        filter: {
          type: 'string',
          description: 'Filter releases by name using a regex pattern (optional)',
        },
        allNamespaces: {
          type: 'boolean',
          description: 'List releases across all namespaces (default: true when no namespace specified)',
        },
      },
    },
  },

  handler: withValidation(async (args) => {
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);
    const filter = optionalParam<string | undefined>(args, 'filter', undefined);
    const allNamespaces = optionalParam<boolean | undefined>(args, 'allNamespaces', undefined);

    const cmdArgs = ['list', '-o', 'json'];

    if (namespace) {
      cmdArgs.push('-n', namespace);
    } else if (allNamespaces !== false) {
      cmdArgs.push('-A');
    }

    if (filter) {
      cmdArgs.push('--filter', filter);
    }

    try {
      const output = await executeHelm(cmdArgs, {
        timeout: 30000,
      });

      const releaseCount = output ? JSON.parse(output).length : 0;
      return successResult(
        output,
        `Found ${releaseCount} Helm release(s)`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to list Helm releases: ${message}`);
    }
  }),
};
