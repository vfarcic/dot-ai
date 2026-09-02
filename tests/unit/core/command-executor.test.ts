/**
 * Unit Tests: Command Executor
 *
 * Tests the command executor logging behavior.
 * PRD #343: Commands are executed through the plugin system via shell_exec tool.
 * PRD #359: Uses unified plugin registry for tool invocation.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockLogger } from '../helpers/mock-logger.js';
import type { InvokeResponse } from '../../../src/core/plugin-types.js';
import type { MockLogger } from '../helpers/mock-logger.js';
import { executeCommands } from '../../../src/core/command-executor';

// Mock the plugin-registry module
vi.mock('../../../src/core/plugin-registry', () => ({
  isPluginInitialized: vi.fn(),
  invokePluginTool: vi.fn(),
}));

import {
  isPluginInitialized,
  invokePluginTool,
} from '../../../src/core/plugin-registry';

/**
 * Build a plugin invoke response that actually satisfies InvokeResponse.
 *
 * The inline literals these replace omitted `sessionId`, `state` and the error
 * `code`, which the real invoke hook always sends — the mocks were unfaithful
 * in a way only typechecking surfaced (#784).
 */
function invokeSuccess(data: string): InvokeResponse {
  return {
    sessionId: 'test-session',
    success: true,
    result: { data },
    state: {},
  };
}

function invokeError(
  message: string,
  code = 'SHELL_EXEC_FAILED'
): InvokeResponse {
  return {
    sessionId: 'test-session',
    success: false,
    error: { code, message },
    state: {},
  };
}

describe('CommandExecutor', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    // Default: plugin is initialized
    vi.mocked(isPluginInitialized).mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Plugin Initialization Check', () => {
    test('should throw error when plugin system is not initialized', async () => {
      vi.mocked(isPluginInitialized).mockReturnValue(false);

      await expect(executeCommands(['echo hello'], mockLogger)).rejects.toThrow(
        'Plugin system not initialized'
      );
    });
  });

  describe('Logging Behavior', () => {
    test('should use DEBUG level for per-command execution logs', async () => {
      // Mock successful plugin responses with data field
      vi.mocked(invokePluginTool).mockResolvedValue(invokeSuccess('output'));

      await executeCommands(['echo hello', 'echo world'], mockLogger, {
        context: 'test',
      });

      // Per-command logs should use DEBUG
      const debugCalls = mockLogger.debug.mock.calls;
      const executingLogs = debugCalls.filter(call =>
        call[0]?.includes('Executing command')
      );
      const succeededLogs = debugCalls.filter(call =>
        call[0]?.includes('succeeded')
      );

      expect(executingLogs.length).toBe(2);
      expect(succeededLogs.length).toBe(2);
    });

    test('should use INFO level for summary logs', async () => {
      // Mock successful plugin responses with data field
      vi.mocked(invokePluginTool).mockResolvedValue(invokeSuccess('output'));

      await executeCommands(['echo hello', 'echo world'], mockLogger, {
        context: 'test execution',
      });

      // Summary logs should use INFO
      const infoCalls = mockLogger.info.mock.calls;

      // Check for starting log
      const startingLog = infoCalls.find(call => call[0]?.includes('Starting'));
      expect(startingLog).toBeDefined();
      expect(startingLog![1]).toHaveProperty('commandCount', 2);

      // Check for completion log
      const completedLog = infoCalls.find(call =>
        call[0]?.includes('completed')
      );
      expect(completedLog).toBeDefined();
      expect(completedLog![1]).toHaveProperty('successCount', 2);
      expect(completedLog![1]).toHaveProperty('failureCount', 0);
    });

    test('should not use INFO for per-command logs', async () => {
      // Mock successful plugin response with data field
      vi.mocked(invokePluginTool).mockResolvedValue(invokeSuccess('output'));

      await executeCommands(['echo hello'], mockLogger);

      // INFO should NOT contain per-command logs
      const infoCalls = mockLogger.info.mock.calls;
      const perCommandInfoLogs = infoCalls.filter(
        call =>
          call[0]?.includes('Executing command') ||
          call[0]?.includes('Command 1 succeeded')
      );

      expect(perCommandInfoLogs.length).toBe(0);
    });
  });

  describe('Execution Results', () => {
    test('should return results for successful commands', async () => {
      // Mock successful plugin response with data field
      vi.mocked(invokePluginTool).mockResolvedValue(invokeSuccess('output'));

      const { results, overallSuccess } = await executeCommands(
        ['echo hello'],
        mockLogger
      );

      expect(overallSuccess).toBe(true);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].output).toBe('output');
    });

    test('should continue on error and report failures', async () => {
      vi.mocked(invokePluginTool)
        .mockResolvedValueOnce(invokeSuccess('first'))
        .mockResolvedValueOnce(invokeError('command failed'))
        .mockResolvedValueOnce(invokeSuccess('third'));

      const { results, overallSuccess } = await executeCommands(
        ['cmd1', 'cmd2', 'cmd3'],
        mockLogger
      );

      expect(overallSuccess).toBe(false);
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('command failed');
      expect(results[2].success).toBe(true);
    });

    test('should invoke plugin with correct tool name and arguments', async () => {
      vi.mocked(invokePluginTool).mockResolvedValue(invokeSuccess('output'));

      await executeCommands(['kubectl get pods'], mockLogger);

      expect(invokePluginTool).toHaveBeenCalledWith(
        'agentic-tools',
        'shell_exec',
        { command: 'kubectl get pods' }
      );
    });
  });
});
