/**
 * kubectl_exec tool
 *
 * Execute arbitrary kubectl commands for remediation actions.
 * PRD #343: General-purpose kubectl execution for commands like scale, rollout, etc.
 *
 * SECURITY NOTE: This tool executes kubectl commands directly. It should only be
 * used for user-approved remediation actions, not for arbitrary AI-driven exploration.
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

export const kubectlExec: KubectlTool = {
  definition: {
    name: 'kubectl_exec_command',
    type: 'agentic',
    description:
      'Execute a kubectl command with the given arguments. Use for remediation commands like scale, rollout restart, label, annotate, etc. Only use for user-approved actions.',
    inputSchema: {
      type: 'object',
      properties: {
        args: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of kubectl arguments (excluding "kubectl" itself). Example: ["scale", "deployment/nginx", "--replicas=3", "-n", "default"]',
        },
        stdin: {
          type: 'string',
          description: 'Optional stdin input for commands that read from stdin (e.g., apply -f -)',
        },
      },
      required: ['args'],
    },
  },

  handler: withValidation(async (args) => {
    const cmdArgs = requireParam<string[]>(args, 'args', 'kubectl_exec_command');
    const stdin = optionalParam<string | undefined>(args, 'stdin', undefined);

    if (!Array.isArray(cmdArgs) || cmdArgs.length === 0) {
      return errorResult(
        'Invalid args parameter',
        'kubectl_exec_command requires a non-empty array of arguments'
      );
    }

    // Security: Block potentially dangerous commands
    const blockedCommands = ['exec', 'port-forward', 'proxy', 'cp'];
    const firstArg = cmdArgs[0]?.toLowerCase();
    if (blockedCommands.includes(firstArg)) {
      return errorResult(
        `Command '${firstArg}' is not allowed`,
        `kubectl_exec_command blocks interactive/dangerous commands: ${blockedCommands.join(', ')}`
      );
    }

    try {
      const output = await executeKubectl(cmdArgs, stdin ? { stdin } : undefined);
      return successResult(output, `Successfully executed: kubectl ${cmdArgs.join(' ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message, `Command failed: kubectl ${cmdArgs.join(' ')}: ${message}`);
    }
  }),
};
