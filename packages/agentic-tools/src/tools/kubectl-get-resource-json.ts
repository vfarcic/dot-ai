/**
 * kubectl_get_resource_json tool
 *
 * Get a single Kubernetes resource as structured JSON.
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

export const kubectlGetResourceJson: KubectlTool = {
  definition: {
    name: 'kubectl_get_resource_json',
    type: 'agentic',
    description:
      'Get a single Kubernetes resource as structured JSON with full metadata, spec, and status. Use this when you need programmatic access to resource configuration and state, such as analyzing ownerReferences, checking exact spec values, or examining detailed status conditions. Returns the complete resource object.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description:
            'Resource to get in kind/name format (e.g., "deployment/my-app", "pod/my-pod", "cluster.postgresql.cnpg.io/my-db"). Must include the resource name.',
        },
        namespace: {
          type: 'string',
          description:
            'Kubernetes namespace. Required for namespaced resources, omit for cluster-scoped resources.',
        },
        field: {
          type: 'string',
          description:
            'Optional: Return only a specific top-level field (e.g., "spec", "status", "metadata"). Omit to return the complete resource.',
        },
      },
      required: ['resource'],
    },
  },

  handler: withValidation(async (args) => {
    const resource = requireParam<string>(args, 'resource', 'kubectl_get_resource_json');
    const namespace = optionalParam<string | undefined>(args, 'namespace', undefined);
    const field = optionalParam<string | undefined>(args, 'field', undefined);

    const cmdArgs = ['get', resource, '-o', 'json'];

    if (namespace) {
      cmdArgs.push('-n', namespace);
    }

    try {
      const output = await executeKubectl(cmdArgs);

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(output) as Record<string, unknown>;
      } catch (parseError) {
        const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
        return errorResult(
          `Failed to parse kubectl output as JSON: ${parseMessage}`,
          `Raw output: ${output.slice(0, 500)}${output.length > 500 ? '...' : ''}`
        );
      }

      // Return specific field or full resource
      let data: unknown = parsed;
      if (field) {
        if (!(field in parsed)) {
          return errorResult(
            `Field '${field}' not found in resource`,
            `Available top-level fields: ${Object.keys(parsed).join(', ')}`
          );
        }
        data = parsed[field];
      }

      const nsMessage = namespace ? ` in namespace ${namespace}` : '';
      const fieldMessage = field ? `${field} for ` : '';
      return successResult(
        JSON.stringify(data, null, 2),
        `Successfully retrieved ${fieldMessage}${resource}${nsMessage}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get ${resource} as JSON: ${message}`);
    }
  }),
};
