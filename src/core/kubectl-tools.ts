/**
 * Kubectl Tools for AI-Powered Investigation
 *
 * Shared tool definitions and executor for kubectl operations.
 * Used by remediation, diagnostics, and other investigation workflows.
 *
 * PRD #143: Tool-Based Remediation with Observability Data Sources
 */

import { AITool } from './ai-provider.interface';
import { executeKubectl } from './kubernetes-utils';
import { VALIDATION_MESSAGES } from './constants/validation';

/**
 * Tool: kubectl_api_resources
 * Get list of all available Kubernetes API resources in the cluster
 */
export const KUBECTL_API_RESOURCES_TOOL: AITool = {
  name: 'kubectl_api_resources',
  description: 'Get list of all available Kubernetes API resources in the cluster (resource types, API groups, namespaced vs cluster-scoped). Use this to discover what resources are available before querying specific resources. Essential for understanding what can be investigated in this cluster.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  }
};

/**
 * Tool: kubectl_get
 * Get Kubernetes resources with their current state
 */
export const KUBECTL_GET_TOOL: AITool = {
  name: 'kubectl_get',
  description: 'Get Kubernetes resources and their current state in TABLE FORMAT (most efficient). Returns compact table with NAME, STATUS, READY, AGE columns. Use this to list resources and check basic status. For detailed information, use kubectl_describe instead. IMPORTANT: Always returns table format - output format flags like -o=yaml or -o=json are automatically stripped.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'Resource type to get (e.g., "pods", "deployments", "services", "pod/my-pod", "clusters.postgresql.cnpg.io"). Can be plural (pods) or singular with name (pod/name). Can include API group for custom resources.'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace to query. Omit for cluster-scoped resources or to query all namespaces.'
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filtering arguments only (e.g., ["--selector=app=myapp"], ["--field-selector=status.phase=Running"], ["--all-namespaces"], ["--show-labels"]). Output format flags (-o=yaml, -o=json, etc.) are NOT allowed and will be automatically stripped.'
      }
    },
    required: ['resource']
  }
};

/**
 * Tool: kubectl_describe
 * Get detailed information about Kubernetes resources
 */
export const KUBECTL_DESCRIBE_TOOL: AITool = {
  name: 'kubectl_describe',
  description: 'Get detailed information about specific Kubernetes resources including configuration, status, events, and relationships. Use this when you need comprehensive details about a specific resource, especially to understand configuration issues or see recent events related to that resource.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'Resource to describe (e.g., "pod/my-pod", "deployment/my-app", "cluster/postgres-db"). Should include the resource name.'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace. Required for namespaced resources.'
      }
    },
    required: ['resource']
  }
};

/**
 * Tool: kubectl_logs
 * Get container logs from pods
 */
export const KUBECTL_LOGS_TOOL: AITool = {
  name: 'kubectl_logs',
  description: 'Get container logs from pods. Essential for debugging application crashes, errors, and understanding runtime behavior. Use --previous flag to get logs from crashed/restarted containers.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'Pod name to get logs from (e.g., "my-pod" or "pod/my-pod").'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace where the pod is running.'
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional log arguments (e.g., ["--previous"] for crashed container logs, ["--tail=50"] to limit output, ["--since=5m"] for recent logs, ["-c", "container-name"] for specific container).'
      }
    },
    required: ['resource', 'namespace']
  }
};

/**
 * Tool: kubectl_events
 * Get Kubernetes events for troubleshooting
 */
export const KUBECTL_EVENTS_TOOL: AITool = {
  name: 'kubectl_events',
  description: 'Get Kubernetes events which record important state changes, errors, warnings, and informational messages from the cluster. Essential for understanding scheduling issues, resource problems, configuration errors, and system-level events affecting resources.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace to get events from. Omit for cluster-wide events.'
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional event arguments (e.g., ["--sort-by=.lastTimestamp"] to sort by time, ["--field-selector=involvedObject.name=my-pod"] to filter by resource, ["--since=10m"] for recent events).'
      }
    },
    required: []
  }
};

/**
 * Tool: kubectl_patch_dryrun
 * Validate patch commands with dry-run before execution
 */
export const KUBECTL_PATCH_DRYRUN_TOOL: AITool = {
  name: 'kubectl_patch_dryrun',
  description: 'Validate that a kubectl patch command will be accepted by the cluster without actually applying it. Use this to test your proposed remediation patches before completing investigation. Essential for confirming command syntax and cluster acceptance.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'Resource to patch (e.g., "deployment/my-app", "cluster/postgres-db"). Must include resource type and name.'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace. Required for namespaced resources.'
      },
      patch: {
        type: 'string',
        description: 'The patch content in JSON format (e.g., \'{"spec":{"replicas":3}}\')'
      },
      patchType: {
        type: 'string',
        description: 'Type of patch: "strategic" (default), "merge", or "json". Use "json" for JSON Patch operations.'
      }
    },
    required: ['resource', 'patch']
  }
};

/**
 * Tool: kubectl_apply_dryrun
 * Validate apply commands with dry-run before execution
 */
export const KUBECTL_APPLY_DRYRUN_TOOL: AITool = {
  name: 'kubectl_apply_dryrun',
  description: 'Validate that a kubectl apply command will be accepted by the cluster without actually applying it. Use this to test applying YAML manifests or configuration changes before completing investigation.',
  inputSchema: {
    type: 'object',
    properties: {
      manifest: {
        type: 'string',
        description: 'The YAML manifest content to apply'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace for the resource. Omit for cluster-scoped resources or if namespace is specified in manifest.'
      }
    },
    required: ['manifest']
  }
};

/**
 * Tool: kubectl_delete_dryrun
 * Validate delete commands with dry-run before execution
 */
export const KUBECTL_DELETE_DRYRUN_TOOL: AITool = {
  name: 'kubectl_delete_dryrun',
  description: 'Validate that a kubectl delete command will be accepted by the cluster without actually deleting resources. Use this to test resource deletion before completing investigation.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'Resource to delete (e.g., "pod/my-pod", "deployment/my-app", "configmap/my-config")'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace. Required for namespaced resources.'
      }
    },
    required: ['resource']
  }
};

/**
 * Tool: kubectl_get_crd_schema
 * Get the OpenAPI v3 schema for a Custom Resource Definition
 */
export const KUBECTL_GET_CRD_SCHEMA_TOOL: AITool = {
  name: 'kubectl_get_crd_schema',
  description: 'Get the OpenAPI v3 schema for a Custom Resource Definition (CRD). Use this to understand the structure, required fields, validation rules, and available properties when crafting patches or configurations for custom resources like CNPG clusters, Crossplane resources, ArgoCD applications, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      crdName: {
        type: 'string',
        description: 'Full CRD name including API group (e.g., "clusters.postgresql.cnpg.io", "compositions.apiextensions.crossplane.io", "applications.argoproj.io"). Use kubectl_api_resources to discover available CRDs.'
      }
    },
    required: ['crdName']
  }
};

/**
 * Tool: kubectl_get_resource_json
 * Get a single Kubernetes resource as structured JSON
 */
export const KUBECTL_GET_RESOURCE_JSON_TOOL: AITool = {
  name: 'kubectl_get_resource_json',
  description: 'Get a single Kubernetes resource as structured JSON with full metadata, spec, and status. Use this when you need programmatic access to resource configuration and state, such as analyzing ownerReferences, checking exact spec values, or examining detailed status conditions. Returns the complete resource object.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'Resource to get in kind/name format (e.g., "deployment/my-app", "pod/my-pod", "cluster.postgresql.cnpg.io/my-db"). Must include the resource name.'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace. Required for namespaced resources, omit for cluster-scoped resources.'
      },
      field: {
        type: 'string',
        description: 'Optional: Return only a specific top-level field (e.g., "spec", "status", "metadata"). Omit to return the complete resource.'
      }
    },
    required: ['resource']
  }
};

/**
 * Tool executor for kubectl-based tools
 * Handles execution and error handling for all kubectl tool calls
 */
export async function executeKubectlTools(toolName: string, input: any): Promise<any> {
  try {
    switch (toolName) {
      case 'kubectl_api_resources': {
        const output = await executeKubectl(['api-resources']);
        return {
          success: true,
          data: output,
          message: 'Successfully retrieved cluster API resources'
        };
      }

      case 'kubectl_get': {
        const { resource, namespace, args = [] } = input;

        if (!resource) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('resource'),
            message: 'kubectl_get requires a resource parameter'
          };
        }

        // Build kubectl command
        const cmdArgs = ['get', resource];

        // Add namespace if provided
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        // Strip output format args - we always return table format for efficiency
        // Allow filtering args like --selector, --field-selector, --all-namespaces, --show-labels
        if (args && Array.isArray(args)) {
          const filteredArgs = args.filter(arg => {
            const argLower = arg.toLowerCase();
            // Block any output format flags
            return !argLower.startsWith('-o=') &&
                   !argLower.startsWith('-o') &&
                   !argLower.startsWith('--output') &&
                   !argLower.includes('=json') &&
                   !argLower.includes('=yaml');
          });
          cmdArgs.push(...filteredArgs);
        }

        const output = await executeKubectl(cmdArgs);
        return {
          success: true,
          data: output,
          message: `Successfully retrieved ${resource}${namespace ? ` in namespace ${namespace}` : ''}`
        };
      }

      case 'kubectl_describe': {
        const { resource, namespace } = input;

        if (!resource) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('resource'),
            message: 'kubectl_describe requires a resource parameter'
          };
        }

        // Build kubectl command
        const cmdArgs = ['describe', resource];

        // Add namespace if provided
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        const output = await executeKubectl(cmdArgs);
        return {
          success: true,
          data: output,
          message: `Successfully described ${resource}${namespace ? ` in namespace ${namespace}` : ''}`
        };
      }

      case 'kubectl_logs': {
        const { resource, namespace, args = [] } = input;

        if (!resource) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('resource'),
            message: 'kubectl_logs requires a resource parameter'
          };
        }

        if (!namespace) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('namespace'),
            message: 'kubectl_logs requires a namespace parameter'
          };
        }

        // Build kubectl command
        const cmdArgs = ['logs', resource, '-n', namespace];

        // Add additional arguments
        if (args && Array.isArray(args)) {
          cmdArgs.push(...args);
        }

        const output = await executeKubectl(cmdArgs);
        return {
          success: true,
          data: output,
          message: `Successfully retrieved logs for ${resource} in namespace ${namespace}`
        };
      }

      case 'kubectl_events': {
        const { namespace, args = [] } = input;

        // Build kubectl command
        const cmdArgs = ['get', 'events'];

        // Add namespace if provided
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        // Add additional arguments
        if (args && Array.isArray(args)) {
          cmdArgs.push(...args);
        }

        const output = await executeKubectl(cmdArgs);
        return {
          success: true,
          data: output,
          message: `Successfully retrieved events${namespace ? ` in namespace ${namespace}` : ' (cluster-wide)'}`
        };
      }

      case 'kubectl_patch_dryrun': {
        const { resource, namespace, patch, patchType = 'strategic' } = input;

        if (!resource) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('resource'),
            message: 'kubectl_patch_dryrun requires a resource parameter'
          };
        }

        if (!patch) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('patch'),
            message: 'kubectl_patch_dryrun requires a patch parameter'
          };
        }

        // Build kubectl command
        const cmdArgs = ['patch', resource, '--dry-run=server'];

        // Add namespace if provided
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        // Add patch type
        if (patchType === 'json') {
          cmdArgs.push('--type=json');
        } else if (patchType === 'merge') {
          cmdArgs.push('--type=merge');
        }
        // strategic is default, no flag needed

        // Add patch content
        cmdArgs.push('-p', patch);

        const output = await executeKubectl(cmdArgs);
        return {
          success: true,
          data: output,
          message: `Dry-run validation successful for patch on ${resource}${namespace ? ` in namespace ${namespace}` : ''}`
        };
      }

      case 'kubectl_apply_dryrun': {
        const { manifest, namespace } = input;

        if (!manifest) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('manifest'),
            message: 'kubectl_apply_dryrun requires a manifest parameter'
          };
        }

        // Build kubectl command
        const cmdArgs = ['apply', '--dry-run=server', '-f', '-'];

        // Add namespace if provided
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        // Execute with manifest as stdin
        const output = await executeKubectl(cmdArgs, { stdin: manifest });
        return {
          success: true,
          data: output,
          message: `Dry-run validation successful for apply${namespace ? ` in namespace ${namespace}` : ''}`
        };
      }

      case 'kubectl_delete_dryrun': {
        const { resource, namespace } = input;

        if (!resource) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('resource'),
            message: 'kubectl_delete_dryrun requires a resource parameter'
          };
        }

        // Build kubectl command
        const cmdArgs = ['delete', resource, '--dry-run=server'];

        // Add namespace if provided
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        const output = await executeKubectl(cmdArgs);
        return {
          success: true,
          data: output,
          message: `Dry-run validation successful for delete on ${resource}${namespace ? ` in namespace ${namespace}` : ''}`
        };
      }

      case 'kubectl_get_crd_schema': {
        const { crdName } = input;

        if (!crdName) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('crdName'),
            message: 'kubectl_get_crd_schema requires a crdName parameter (e.g., "clusters.postgresql.cnpg.io")'
          };
        }

        // Get CRD definition in JSON format - AI can parse what it needs
        const cmdArgs = ['get', 'crd', crdName, '-o', 'json'];
        const output = await executeKubectl(cmdArgs);

        return {
          success: true,
          data: output,
          message: `Successfully retrieved CRD schema for ${crdName}`
        };
      }

      case 'kubectl_get_resource_json': {
        const { resource, namespace, field } = input;

        if (!resource) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('resource'),
            message: 'kubectl_get_resource_json requires a resource parameter (e.g., "deployment/my-app")'
          };
        }

        // Build kubectl command to get resource as JSON
        const cmdArgs = ['get', resource, '-o', 'json'];

        // Add namespace if provided
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        const output = await executeKubectl(cmdArgs);

        let parsed: any;
        try {
          parsed = JSON.parse(output);
        } catch (parseError) {
          return {
            success: false,
            error: `Failed to parse kubectl output as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            message: `Raw output: ${output.slice(0, 500)}${output.length > 500 ? '...' : ''}`
          };
        }

        // Return specific field or full resource
        let data = parsed;
        if (field) {
          if (!(field in parsed)) {
            return {
              success: false,
              error: `Field '${field}' not found in resource`,
              message: `Available top-level fields: ${Object.keys(parsed).join(', ')}`
            };
          }
          data = parsed[field];
        }

        return {
          success: true,
          data: JSON.stringify(data, null, 2),
          message: `Successfully retrieved ${field ? field + ' for ' : ''}${resource}${namespace ? ` in namespace ${namespace}` : ''}`
        };
      }

      default:
        return {
          success: false,
          error: `Unknown kubectl tool: ${toolName}`,
          message: `Tool '${toolName}' is not implemented`
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      message: `Failed to execute ${toolName}: ${errorMessage}`
    };
  }
}

/**
 * All kubectl investigation tools (read-only operations + dry-run validation)
 * Used during investigation phase for gathering cluster state information and validating solutions
 * Convenient array for passing to toolLoop()
 */
export const KUBECTL_INVESTIGATION_TOOLS: AITool[] = [
  KUBECTL_API_RESOURCES_TOOL,
  KUBECTL_GET_TOOL,
  KUBECTL_DESCRIBE_TOOL,
  KUBECTL_LOGS_TOOL,
  KUBECTL_EVENTS_TOOL,
  KUBECTL_PATCH_DRYRUN_TOOL,
  KUBECTL_APPLY_DRYRUN_TOOL,
  KUBECTL_DELETE_DRYRUN_TOOL,
  KUBECTL_GET_CRD_SCHEMA_TOOL,
  KUBECTL_GET_RESOURCE_JSON_TOOL
];
