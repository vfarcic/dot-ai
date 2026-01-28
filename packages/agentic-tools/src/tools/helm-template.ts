/**
 * helm_template tool
 *
 * Render Helm chart templates locally without installing.
 * PRD #343: Helm operations via plugin system.
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

export const helmTemplate: KubectlTool = {
  definition: {
    name: 'helm_template',
    type: 'agentic',
    description:
      'Render Helm chart templates locally and return the YAML output. Does not require cluster access.',
    inputSchema: {
      type: 'object',
      properties: {
        releaseName: {
          type: 'string',
          description: 'Name to use for the release in rendered templates (e.g., "my-prometheus")',
        },
        chart: {
          type: 'string',
          description: 'Chart reference (e.g., "prometheus-community/prometheus" or path to local chart)',
        },
        namespace: {
          type: 'string',
          description: 'Namespace to use in rendered templates (default: "default")',
        },
        values: {
          type: 'string',
          description: 'YAML content for values.yaml override (optional)',
        },
        version: {
          type: 'string',
          description: 'Specific chart version to render (optional, uses latest if not specified)',
        },
      },
      required: ['releaseName', 'chart'],
    },
  },

  handler: withValidation(async (args) => {
    const releaseName = requireParam<string>(args, 'releaseName', 'helm_template');
    const chart = requireParam<string>(args, 'chart', 'helm_template');
    const namespace = optionalParam<string>(args, 'namespace', 'default');
    const values = optionalParam<string | undefined>(args, 'values', undefined);
    const version = optionalParam<string | undefined>(args, 'version', undefined);

    const cmdArgs = ['template', releaseName, chart];

    if (version) {
      cmdArgs.push('--version', version);
    }

    cmdArgs.push('--namespace', namespace);

    // If values provided, use stdin
    if (values) {
      cmdArgs.push('-f', '-');
    }

    try {
      const output = await executeHelm(cmdArgs, {
        stdin: values,
        timeout: 60000, // 1 minute timeout for template rendering
      });

      return successResult(
        output,
        `Successfully rendered templates for "${releaseName}" from chart "${chart}"`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Helm template failed: ${message}`);
    }
  }),
};
