/**
 * Documentation Validation Pod Tools
 *
 * PRD #388: Manages validation pod creation, deletion, status checking, TTL cleanup,
 * and command execution inside validation pods.
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

const DEFAULT_IMAGE = 'ghcr.io/vfarcic/dot-ai-docs-validator:latest';
const DEFAULT_NAMESPACE = 'dot-ai-docs-validation';
const DEFAULT_TTL_HOURS = 24;
const POD_READY_TIMEOUT_SECONDS = 120;
const DEFAULT_EXEC_TIMEOUT_MS = 120000;

/**
 * Generate a unique pod name with dvl- prefix and 8-char hex suffix.
 */
function generatePodName(): string {
  const hex = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return `dvl-${hex}`;
}

/**
 * Build the YAML manifest for a validation pod.
 */
function buildPodManifest(config: {
  podName: string;
  namespace: string;
  image: string;
  sessionId: string;
  ttlDeadline: string;
}): string {
  return `apiVersion: v1
kind: Pod
metadata:
  name: ${config.podName}
  namespace: ${config.namespace}
  labels:
    app.kubernetes.io/managed-by: dot-ai
    dot-ai/tool: docs-validation
    dot-ai/session-id: ${config.sessionId}
  annotations:
    dot-ai/ttl-deadline: "${config.ttlDeadline}"
spec:
  containers:
  - name: validator
    image: ${config.image}
    command: ["sleep", "infinity"]
    resources:
      requests:
        cpu: 200m
        memory: 256Mi
      limits:
        cpu: "1"
        memory: 2Gi
  restartPolicy: Never`;
}

/**
 * docs_validate_create_pod - Create a validation pod with namespace, labels, and TTL.
 */
export const docsValidateCreatePod: KubectlTool = {
  definition: {
    name: 'docs_validate_create_pod',
    type: 'agentic',
    description:
      'Create a documentation validation pod. Ensures namespace exists, creates pod with labels and TTL annotation, waits for it to be ready.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID to associate with the pod',
        },
        namespace: {
          type: 'string',
          description: `Namespace for the pod (default: ${DEFAULT_NAMESPACE})`,
        },
        image: {
          type: 'string',
          description: `Container image for the pod (default: ${DEFAULT_IMAGE})`,
        },
        ttlHours: {
          type: 'number',
          description: `TTL in hours before auto-cleanup (default: ${DEFAULT_TTL_HOURS})`,
        },
      },
      required: ['sessionId'],
    },
  },

  handler: withValidation(async args => {
    const sessionId = requireParam<string>(
      args,
      'sessionId',
      'docs_validate_create_pod'
    );
    const namespace = optionalParam<string>(
      args,
      'namespace',
      DEFAULT_NAMESPACE
    );
    const image = optionalParam<string>(args, 'image', DEFAULT_IMAGE);
    const ttlHours = optionalParam<number>(args, 'ttlHours', DEFAULT_TTL_HOURS);

    const podName = generatePodName();
    const ttlDeadline = new Date(
      Date.now() + ttlHours * 60 * 60 * 1000
    ).toISOString();

    try {
      // Create the pod (namespace must already exist — created by Helm chart)
      const podManifest = buildPodManifest({
        podName,
        namespace,
        image,
        sessionId,
        ttlDeadline,
      });
      await executeKubectl(['apply', '-f', '-'], { stdin: podManifest });

      // Wait for pod to be ready
      await executeKubectl(
        [
          'wait',
          '--for=condition=Ready',
          `pod/${podName}`,
          '-n',
          namespace,
          `--timeout=${POD_READY_TIMEOUT_SECONDS}s`,
        ],
        { timeout: (POD_READY_TIMEOUT_SECONDS + 10) * 1000 }
      );

      const result = JSON.stringify({ podName, namespace, image, ttlDeadline });
      return successResult(
        result,
        `Created validation pod ${podName} in namespace ${namespace}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Attempt cleanup if pod was created but didn't become ready
      try {
        await executeKubectl([
          'delete',
          'pod',
          podName,
          '-n',
          namespace,
          '--ignore-not-found',
        ]);
      } catch {
        // Best-effort cleanup
      }
      return errorResult(
        message,
        `Failed to create validation pod: ${message}`
      );
    }
  }),
};

/**
 * docs_validate_delete_pod - Delete a validation pod.
 */
export const docsValidateDeletePod: KubectlTool = {
  definition: {
    name: 'docs_validate_delete_pod',
    type: 'agentic',
    description: 'Delete a documentation validation pod by name and namespace.',
    inputSchema: {
      type: 'object',
      properties: {
        podName: {
          type: 'string',
          description: 'Name of the pod to delete',
        },
        namespace: {
          type: 'string',
          description: `Namespace of the pod (default: ${DEFAULT_NAMESPACE})`,
        },
      },
      required: ['podName'],
    },
  },

  handler: withValidation(async args => {
    const podName = requireParam<string>(
      args,
      'podName',
      'docs_validate_delete_pod'
    );
    const namespace = optionalParam<string>(
      args,
      'namespace',
      DEFAULT_NAMESPACE
    );

    try {
      const output = await executeKubectl([
        'delete',
        'pod',
        podName,
        '-n',
        namespace,
        '--ignore-not-found',
      ]);
      return successResult(
        output,
        `Deleted pod ${podName} in namespace ${namespace}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(
        message,
        `Failed to delete pod ${podName}: ${message}`
      );
    }
  }),
};

/**
 * docs_validate_pod_status - Get the status of a validation pod.
 */
export const docsValidatePodStatus: KubectlTool = {
  definition: {
    name: 'docs_validate_pod_status',
    type: 'agentic',
    description: 'Get the status phase of a documentation validation pod.',
    inputSchema: {
      type: 'object',
      properties: {
        podName: {
          type: 'string',
          description: 'Name of the pod to check',
        },
        namespace: {
          type: 'string',
          description: `Namespace of the pod (default: ${DEFAULT_NAMESPACE})`,
        },
      },
      required: ['podName'],
    },
  },

  handler: withValidation(async args => {
    const podName = requireParam<string>(
      args,
      'podName',
      'docs_validate_pod_status'
    );
    const namespace = optionalParam<string>(
      args,
      'namespace',
      DEFAULT_NAMESPACE
    );

    try {
      const phase = await executeKubectl([
        'get',
        `pod/${podName}`,
        '-n',
        namespace,
        '-o',
        'jsonpath={.status.phase}',
      ]);
      const result = JSON.stringify({ phase: phase || 'Unknown' });
      return successResult(
        result,
        `Pod ${podName} is in phase: ${phase || 'Unknown'}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Pod not found is a valid state, not an error
      if (message.includes('not found') || message.includes('NotFound')) {
        const result = JSON.stringify({ phase: 'NotFound' });
        return successResult(result, `Pod ${podName} not found`);
      }
      return errorResult(message, `Failed to get pod status: ${message}`);
    }
  }),
};

/**
 * docs_validate_ttl_sweep - Clean up expired validation pods based on TTL annotations.
 */
export const docsValidateTtlSweep: KubectlTool = {
  definition: {
    name: 'docs_validate_ttl_sweep',
    type: 'agentic',
    description:
      'Sweep for expired documentation validation pods and delete them. Checks the dot-ai/ttl-deadline annotation against current time.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: {
          type: 'string',
          description: `Namespace to sweep (default: ${DEFAULT_NAMESPACE})`,
        },
      },
      required: [],
    },
  },

  handler: withValidation(async args => {
    const namespace = optionalParam<string>(
      args,
      'namespace',
      DEFAULT_NAMESPACE
    );
    const deletedPods: string[] = [];

    try {
      // Get all docs-validation pods with their TTL deadlines
      const output = await executeKubectl([
        'get',
        'pods',
        '-n',
        namespace,
        '-l',
        'dot-ai/tool=docs-validation',
        '-o',
        'jsonpath={range .items[*]}{.metadata.name}|{.metadata.annotations.dot-ai/ttl-deadline}{"\\n"}{end}',
      ]);

      if (!output.trim()) {
        return successResult(
          JSON.stringify({ deletedPods }),
          'No validation pods found'
        );
      }

      const now = new Date();
      const lines = output.split('\n').filter(Boolean);

      for (const line of lines) {
        const [podName, deadline] = line.split('|');
        if (!podName || !deadline) continue;

        const deadlineDate = new Date(deadline);
        if (isNaN(deadlineDate.getTime())) continue;

        if (deadlineDate < now) {
          try {
            await executeKubectl([
              'delete',
              'pod',
              podName.trim(),
              '-n',
              namespace,
              '--ignore-not-found',
            ]);
            deletedPods.push(podName.trim());
          } catch {
            // Best-effort deletion; continue sweeping other pods
          }
        }
      }

      const result = JSON.stringify({ deletedPods });
      const message =
        deletedPods.length > 0
          ? `Deleted ${deletedPods.length} expired pod(s): ${deletedPods.join(', ')}`
          : 'No expired pods found';
      return successResult(result, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Namespace not existing is not an error for sweep
      if (message.includes('not found') || message.includes('NotFound')) {
        return successResult(
          JSON.stringify({ deletedPods }),
          'Namespace does not exist, nothing to sweep'
        );
      }
      return errorResult(message, `TTL sweep failed: ${message}`);
    }
  }),
};

/**
 * docs_validate_exec - Execute a command inside a validation pod.
 */
export const docsValidateExec: KubectlTool = {
  definition: {
    name: 'docs_validate_exec',
    type: 'agentic',
    description:
      'Execute a command inside a documentation validation pod via kubectl exec.',
    inputSchema: {
      type: 'object',
      properties: {
        podName: {
          type: 'string',
          description: 'Name of the validation pod',
        },
        namespace: {
          type: 'string',
          description: `Namespace of the pod (default: ${DEFAULT_NAMESPACE})`,
        },
        command: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Command and arguments to execute (e.g., ["git", "clone", "https://..."])',
        },
        timeoutMs: {
          type: 'number',
          description: `Timeout in milliseconds (default: ${DEFAULT_EXEC_TIMEOUT_MS})`,
        },
      },
      required: ['podName', 'command'],
    },
  },

  handler: withValidation(async args => {
    const podName = requireParam<string>(args, 'podName', 'docs_validate_exec');
    const command = requireParam<string[]>(
      args,
      'command',
      'docs_validate_exec'
    );
    const namespace = optionalParam<string>(
      args,
      'namespace',
      DEFAULT_NAMESPACE
    );
    const timeoutMs = optionalParam<number>(
      args,
      'timeoutMs',
      DEFAULT_EXEC_TIMEOUT_MS
    );

    if (!Array.isArray(command) || command.length === 0) {
      return errorResult(
        'command must be a non-empty array of strings',
        'docs_validate_exec requires a non-empty command array'
      );
    }

    try {
      const kubectlArgs = [
        'exec',
        `pod/${podName}`,
        '-n',
        namespace,
        '-c',
        'validator',
        '--',
        ...command,
      ];

      const stdout = await executeKubectl(kubectlArgs, { timeout: timeoutMs });
      const result = JSON.stringify({ stdout, exitCode: 0 });
      return successResult(result, `Command executed in pod ${podName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Return stderr/error as data rather than failing the tool,
      // so the caller can decide how to handle non-zero exits
      const result = JSON.stringify({ stderr: message, exitCode: 1 });
      return successResult(
        result,
        `Command failed in pod ${podName}: ${message}`
      );
    }
  }),
};
