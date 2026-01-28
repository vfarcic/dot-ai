/**
 * shell_exec tool
 *
 * Execute shell commands in the plugin container.
 * PRD #343: The plugin container has RBAC, so command execution goes through here.
 *
 * This tool executes commands exactly as provided, without parsing or transformation.
 * Commands are expected to be pre-validated (e.g., via dry-run during AI investigation).
 */

import { promisify } from 'util';
import { exec } from 'child_process';

import {
  KubectlTool,
  successResult,
  errorResult,
  requireParam,
  withValidation,
} from './base';

const execAsync = promisify(exec);

export const shellExec: KubectlTool = {
  definition: {
    name: 'shell_exec',
    type: 'agentic',
    description:
      'Execute a shell command in the plugin container. Used for running validated remediation commands. The command is executed exactly as provided.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The full shell command to execute (e.g., kubectl apply -f - <<EOF...EOF)',
        },
      },
      required: ['command'],
    },
  },

  handler: withValidation(async (args) => {
    const command = requireParam<string>(args, 'command', 'shell_exec');

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      });

      const output = stdout?.trim() || '';
      const stderrOutput = stderr?.trim() || '';

      // Include stderr in output if present (kubectl often writes to stderr)
      const fullOutput = stderrOutput ? `${output}\n${stderrOutput}`.trim() : output;

      return successResult(fullOutput, `Command executed successfully`);
    } catch (error: any) {
      // exec error includes stdout/stderr in the error object
      const stdout = error.stdout?.trim() || '';
      const stderr = error.stderr?.trim() || '';
      const message = error.message || 'Command execution failed';

      // Combine all output for error context
      const errorOutput = [message, stdout, stderr].filter(Boolean).join('\n');

      return errorResult(errorOutput, `Command failed: ${message}`);
    }
  }),
};
