/**
 * helm_history tool
 *
 * Get revision history of a Helm release.
 * PRD #251: Helm Day-2 operations - investigation tools.
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

export const helmHistory: KubectlTool = {
  definition: {
    name: 'helm_history',
    type: 'agentic',
    description:
      'Get revision history of a Helm release. Shows all revisions with their status, chart version, and description. Use to identify rollback targets or understand upgrade history.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name of the Helm release to get history for',
        },
        namespace: {
          type: 'string',
          description: 'Kubernetes namespace where the release is installed (default: "default")',
        },
        max: {
          type: 'number',
          description: 'Maximum number of revisions to return (optional, returns all by default)',
        },
      },
      required: ['releaseName'],
    },
  },

  handler: withValidation(async (args) => {
    const releaseName = requireParam<string>(args, 'releaseName', 'helm_history');
    const namespace = optionalParam<string>(args, 'namespace', 'default');
    const max = optionalParam<number | undefined>(args, 'max', undefined);

    const cmdArgs = ['history', releaseName, '-o', 'json'];

    if (max !== undefined && max > 0) {
      cmdArgs.push('--max', String(max));
    }

    try {
      const output = await executeHelm(cmdArgs, {
        namespace,
        timeout: 30000,
      });

      const revisionCount = output ? JSON.parse(output).length : 0;
      return successResult(
        output,
        `Found ${revisionCount} revision(s) for release "${releaseName}"`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get history for release "${releaseName}": ${message}`);
    }
  }),
};
