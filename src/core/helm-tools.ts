/**
 * Helm Tools for AI-Powered Investigation
 *
 * Shared tool definitions and executor for Helm operations.
 * Used by remediation, diagnostics, and operate workflows to query Helm release state.
 *
 * PRD #251: Helm Day-2 Operations
 */

import { AITool } from './ai-provider.interface';
import { execAsync } from './platform-utils';

/**
 * Tool: helm_list
 * List all Helm releases in the cluster
 */
export const HELM_LIST_TOOL: AITool = {
  name: 'helm_list',
  description: 'List all Helm releases in the cluster. Returns release name, namespace, chart, version, status, and last updated time. Use this to discover what applications are managed by Helm and their current state. Essential for identifying Helm-managed applications before performing operations.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace to list releases from. Omit to list releases across all namespaces.'
      },
      filter: {
        type: 'string',
        description: 'Filter releases by name using a regex pattern (e.g., "prometheus" to find prometheus-related releases).'
      }
    },
    required: []
  }
};

/**
 * Tool: helm_status
 * Get detailed status of a Helm release
 */
export const HELM_STATUS_TOOL: AITool = {
  name: 'helm_status',
  description: 'Get detailed status of a specific Helm release including deployment status, revision number, last deployed time, and any notes from the chart. Use this to understand the current state of a Helm-managed application, especially when diagnosing issues or preparing for upgrades.',
  inputSchema: {
    type: 'object',
    properties: {
      release: {
        type: 'string',
        description: 'Name of the Helm release to get status for (e.g., "prometheus", "argocd", "cert-manager").'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace where the release is deployed. Required for namespaced releases.'
      }
    },
    required: ['release']
  }
};

/**
 * Tool: helm_history
 * Get revision history of a Helm release
 */
export const HELM_HISTORY_TOOL: AITool = {
  name: 'helm_history',
  description: 'Get the revision history of a Helm release showing all past deployments, upgrades, and rollbacks. Each revision includes status, chart version, app version, and description. Essential for identifying rollback targets and understanding deployment timeline when troubleshooting issues.',
  inputSchema: {
    type: 'object',
    properties: {
      release: {
        type: 'string',
        description: 'Name of the Helm release to get history for (e.g., "prometheus", "argocd").'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace where the release is deployed. Required for namespaced releases.'
      },
      max: {
        type: 'number',
        description: 'Maximum number of revisions to return. Defaults to 256 (Helm default).'
      }
    },
    required: ['release']
  }
};

/**
 * Tool: helm_get_values
 * Get the current custom values of a Helm release
 */
export const HELM_GET_VALUES_TOOL: AITool = {
  name: 'helm_get_values',
  description: 'Get the current custom values (user-supplied configuration) for a Helm release. Shows only values that differ from chart defaults. Use this to understand how a release was configured, preserve settings during upgrades, or diagnose configuration-related issues.',
  inputSchema: {
    type: 'object',
    properties: {
      release: {
        type: 'string',
        description: 'Name of the Helm release to get values for (e.g., "prometheus", "argocd").'
      },
      namespace: {
        type: 'string',
        description: 'Kubernetes namespace where the release is deployed. Required for namespaced releases.'
      },
      allValues: {
        type: 'boolean',
        description: 'If true, returns all computed values (chart defaults + user values). Default is false (user values only).'
      }
    },
    required: ['release']
  }
};

/**
 * Execute a Helm command and return the result
 */
async function executeHelm(args: string[]): Promise<string> {
  const command = `helm ${args.join(' ')}`;
  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
    });
    // Return stdout, but include stderr if there's useful info
    return stdout + (stderr && !stderr.includes('WARNING') ? `\n${stderr}` : '');
  } catch (error) {
    const err = error as any;
    // Include both stdout and stderr in error for context
    const errorOutput = err.stderr || err.message || String(error);
    throw new Error(errorOutput);
  }
}

/**
 * Tool executor for Helm-based tools
 * Handles execution and error handling for all Helm tool calls
 */
export async function executeHelmTools(toolName: string, input: any): Promise<any> {
  try {
    switch (toolName) {
      case 'helm_list': {
        const { namespace, filter } = input;

        // Build helm list command with JSON output
        const cmdArgs = ['list', '-o', 'json'];

        // Add namespace or all-namespaces flag
        if (namespace) {
          cmdArgs.push('-n', namespace);
        } else {
          cmdArgs.push('-A'); // All namespaces
        }

        // Add filter if provided
        if (filter) {
          cmdArgs.push('--filter', filter);
        }

        const output = await executeHelm(cmdArgs);

        // Parse JSON output
        let releases: any[] = [];
        try {
          releases = JSON.parse(output || '[]');
        } catch {
          // If JSON parsing fails, return raw output
          return {
            success: true,
            data: output,
            message: 'Retrieved Helm releases (raw output)'
          };
        }

        return {
          success: true,
          data: releases,
          count: releases.length,
          message: `Found ${releases.length} Helm release(s)${namespace ? ` in namespace ${namespace}` : ' across all namespaces'}`
        };
      }

      case 'helm_status': {
        const { release, namespace } = input;

        if (!release) {
          return {
            success: false,
            error: 'Missing required parameter: release',
            message: 'helm_status requires a release name'
          };
        }

        // Build helm status command with JSON output
        const cmdArgs = ['status', release, '-o', 'json'];

        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        const output = await executeHelm(cmdArgs);

        // Parse JSON output
        let status: any;
        try {
          status = JSON.parse(output);
        } catch {
          // If JSON parsing fails, return raw output
          return {
            success: true,
            data: output,
            message: `Retrieved status for release ${release} (raw output)`
          };
        }

        return {
          success: true,
          data: status,
          message: `Successfully retrieved status for release ${release}${namespace ? ` in namespace ${namespace}` : ''}`
        };
      }

      case 'helm_history': {
        const { release, namespace, max } = input;

        if (!release) {
          return {
            success: false,
            error: 'Missing required parameter: release',
            message: 'helm_history requires a release name'
          };
        }

        // Build helm history command with JSON output
        const cmdArgs = ['history', release, '-o', 'json'];

        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        if (max && typeof max === 'number') {
          cmdArgs.push('--max', String(max));
        }

        const output = await executeHelm(cmdArgs);

        // Parse JSON output
        let history: any[] = [];
        try {
          history = JSON.parse(output || '[]');
        } catch {
          // If JSON parsing fails, return raw output
          return {
            success: true,
            data: output,
            message: `Retrieved history for release ${release} (raw output)`
          };
        }

        return {
          success: true,
          data: history,
          revisionCount: history.length,
          message: `Found ${history.length} revision(s) for release ${release}${namespace ? ` in namespace ${namespace}` : ''}`
        };
      }

      case 'helm_get_values': {
        const { release, namespace, allValues } = input;

        if (!release) {
          return {
            success: false,
            error: 'Missing required parameter: release',
            message: 'helm_get_values requires a release name'
          };
        }

        // Build helm get values command with JSON output
        const cmdArgs = ['get', 'values', release, '-o', 'json'];

        if (namespace) {
          cmdArgs.push('-n', namespace);
        }

        if (allValues === true) {
          cmdArgs.push('-a'); // Include all computed values
        }

        const output = await executeHelm(cmdArgs);

        // Parse JSON output
        let values: any;
        try {
          values = JSON.parse(output || '{}');
        } catch {
          // If JSON parsing fails, return raw output
          return {
            success: true,
            data: output,
            message: `Retrieved values for release ${release} (raw output)`
          };
        }

        const valueCount = Object.keys(values).length;
        return {
          success: true,
          data: values,
          valueCount,
          message: `Retrieved ${valueCount} custom value(s) for release ${release}${namespace ? ` in namespace ${namespace}` : ''}${allValues ? ' (including defaults)' : ''}`
        };
      }

      default:
        return {
          success: false,
          error: `Unknown Helm tool: ${toolName}`,
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
 * All Helm investigation tools (read-only operations)
 * Used during investigation phase for gathering Helm release state information
 * Convenient array for passing to toolLoop()
 */
export const HELM_INVESTIGATION_TOOLS: AITool[] = [
  HELM_LIST_TOOL,
  HELM_STATUS_TOOL,
  HELM_HISTORY_TOOL,
  HELM_GET_VALUES_TOOL
];
