/**
 * kubectl_get_printer_columns tool
 *
 * Get printer columns for a resource type.
 * PRD #343: Internal tool for capability scanning.
 */

import {
  KubectlTool,
  executeKubectl,
  successResult,
  errorResult,
  requireParam,
  withValidation,
} from './base';

export const kubectlGetPrinterColumns: KubectlTool = {
  definition: {
    name: 'kubectl_get_printer_columns',
    type: 'agentic',
    description:
      'Get printer columns for a resource type. INTERNAL USE ONLY - used by capability scanning to discover how resources are displayed.',
    inputSchema: {
      type: 'object',
      properties: {
        resourcePlural: {
          type: 'string',
          description: 'Plural name of the resource (e.g., "deployments", "pods", "clusters")',
        },
        apiVersion: {
          type: 'string',
          description: 'Full API version (e.g., "apps/v1", "v1", "postgresql.cnpg.io/v1")',
        },
      },
      required: ['resourcePlural', 'apiVersion'],
    },
  },

  handler: withValidation(async (args) => {
    const resourcePlural = requireParam<string>(args, 'resourcePlural', 'kubectl_get_printer_columns');
    const apiVersion = requireParam<string>(args, 'apiVersion', 'kubectl_get_printer_columns');

    try {
      // First check if any resources exist
      let checkOutput = '';
      try {
        checkOutput = await executeKubectl(['get', resourcePlural, '-o', 'name', '--all-namespaces']);
      } catch {
        checkOutput = '';
      }

      if (!checkOutput.trim()) {
        // No resources exist - try to get columns from CRD if it's a custom resource
        if (apiVersion.includes('/') && apiVersion !== 'apps/v1' && apiVersion !== 'v1') {
          // It's a CRD - get printer columns from CRD spec
          const group = apiVersion.split('/')[0];
          const crdName = `${resourcePlural}.${group}`;

          try {
            const crdOutput = await executeKubectl(['get', 'crd', crdName, '-o', 'json']);
            const crd = JSON.parse(crdOutput);

            // Find the version spec
            const versions = crd.spec?.versions || [];
            const versionSpec = versions.find((v: { name: string }) => `${group}/${v.name}` === apiVersion) || versions[0];

            const additionalColumns = versionSpec?.additionalPrinterColumns || [];

            const columns = additionalColumns.map((col: { name: string; type?: string; jsonPath?: string; description?: string; priority?: number }) => ({
              name: col.name,
              type: col.type || 'string',
              jsonPath: col.jsonPath || '',
              description: col.description,
              priority: col.priority,
            }));

            return successResult(
              JSON.stringify(columns),
              `Retrieved ${additionalColumns.length} printer columns from CRD ${crdName}`
            );
          } catch {
            // CRD doesn't exist or can't be accessed
            return successResult(
              JSON.stringify([]),
              `No printer columns found for ${resourcePlural} (${apiVersion})`
            );
          }
        }

        // Core resource with no instances - return empty
        return successResult(
          JSON.stringify([]),
          `No printer columns available for ${resourcePlural} (no instances found)`
        );
      }

      // Resources exist - get column headers from table output
      const headerOutput = await executeKubectl(['get', resourcePlural, '--all-namespaces', '-o', 'wide']);
      const lines = headerOutput.trim().split('\n');

      if (lines.length > 0) {
        // First line is headers
        const headers = lines[0].split(/\s{2,}/).map((h: string) => h.trim()).filter((h: string) => h);

        const columns = headers.map((name: string) => ({
          name,
          type: 'string',
          jsonPath: '', // Can't determine jsonPath from table output
          description: '',
          priority: 0,
        }));

        return successResult(
          JSON.stringify(columns),
          `Retrieved ${headers.length} printer columns for ${resourcePlural}`
        );
      }

      return successResult(
        JSON.stringify([]),
        `No printer columns found for ${resourcePlural}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get printer columns for ${resourcePlural}: ${message}`);
    }
  }),
};
