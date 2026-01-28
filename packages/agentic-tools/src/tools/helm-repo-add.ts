/**
 * helm_repo_add tool
 *
 * Add or update a Helm repository.
 * PRD #343: Helm operations via plugin system.
 */

import {
  KubectlTool,
  executeHelm,
  successResult,
  errorResult,
  requireParam,
  withValidation,
} from './base';

export const helmRepoAdd: KubectlTool = {
  definition: {
    name: 'helm_repo_add',
    type: 'agentic',
    description:
      'Add or update a Helm chart repository. If the repository already exists, it will be updated.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name to assign to the repository (e.g., "prometheus-community")',
        },
        url: {
          type: 'string',
          description: 'URL of the Helm chart repository (e.g., "https://prometheus-community.github.io/helm-charts")',
        },
      },
      required: ['name', 'url'],
    },
  },

  handler: withValidation(async (args) => {
    const name = requireParam<string>(args, 'name', 'helm_repo_add');
    const url = requireParam<string>(args, 'url', 'helm_repo_add');

    try {
      // Add repository (--force-update updates if exists)
      await executeHelm(['repo', 'add', name, url, '--force-update']);

      // Update repository index
      await executeHelm(['repo', 'update', name]);

      return successResult(
        `Repository "${name}" added/updated successfully`,
        `Added Helm repository ${name} from ${url} and updated index`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to add repository: ${message}`);
    }
  }),
};
