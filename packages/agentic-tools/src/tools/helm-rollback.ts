/**
 * helm_rollback tool
 *
 * Rollback a Helm release to a previous revision.
 * PRD #251: Helm Day-2 operations - operate tool enhancements.
 */

import {
  KubectlTool,
  executeHelm,
  successResult,
  errorResult,
  requireParam,
  optionalParam,
  withValidation,
} from './base';

export const helmRollback: KubectlTool = {
  definition: {
    name: 'helm_rollback',
    type: 'agentic',
    description:
      'Rollback a Helm release to a previous revision. Use helm_history first to identify the target revision. Commonly used to recover from failed upgrades or restore a known-good state.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release to rollback',
        },
        revision: {
          type: 'number',
          description: 'Target revision number to rollback to (use helm_history to find available revisions)',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace where the release is installed (default: "default")',
        },
        wait: {
          type: 'boolean',
          description: 'If true, waits for all resources to be ready after rollback (default: false)',
        },
        timeout: {
          type: 'string',
          description: 'Time to wait for operations (e.g., "5m", "300s"). Default: "5m"',
        },
      },
      required: ['releaseName', 'revision'],
    },
  },

  handler: withValidation(async (args) => {
    const releaseName = requireParam<string>(args, 'releaseName', 'helm_rollback');
    const revision = requireParam<number>(args, 'revision', 'helm_rollback');
    const namespace = optionalParam<string>(args, 'namespace', 'default');
    const wait = optionalParam<boolean>(args, 'wait', false);
    const timeout = optionalParam<string>(args, 'timeout', '5m');

    const cmdArgs = ['rollback', releaseName, String(revision)];

    if (wait) {
      cmdArgs.push('--wait');
    }

    cmdArgs.push('--timeout', timeout);

    try {
      const output = await executeHelm(cmdArgs, {
        namespace,
        timeout: 300000,
      });

      return successResult(
        output,
        `Release "${releaseName}" rolled back to revision ${revision} in namespace "${namespace}"`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Helm rollback failed: ${message}`);
    }
  }),
};
