/**
 * kubectl_get_crd_schema tool
 *
 * Get the OpenAPI v3 schema for a Custom Resource Definition.
 */

import {
  KubectlTool,
  executeKubectl,
  successResult,
  errorResult,
  requireParam,
  withValidation,
} from './base';

export const kubectlGetCrdSchema: KubectlTool = {
  definition: {
    name: 'kubectl_get_crd_schema',
    type: 'agentic',
    description:
      'Get the OpenAPI v3 schema for a Custom Resource Definition (CRD). Use this to understand the structure, required fields, validation rules, and available properties when crafting patches or configurations for custom resources like CNPG clusters, Crossplane resources, ArgoCD applications, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        crdName: {
          type: 'string',
          description:
            'Full CRD name including API group (e.g., "clusters.postgresql.cnpg.io", "compositions.apiextensions.crossplane.io", "applications.argoproj.io"). Use kubectl_api_resources to discover available CRDs.',
        },
      },
      required: ['crdName'],
    },
  },

  handler: withValidation(async (args) => {
    const crdName = requireParam<string>(args, 'crdName', 'kubectl_get_crd_schema');

    const cmdArgs = ['get', 'crd', crdName, '-o', 'json'];

    try {
      const output = await executeKubectl(cmdArgs);
      return successResult(output, `Successfully retrieved CRD schema for ${crdName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Failed to get CRD schema for ${crdName}: ${message}`);
    }
  }),
};
