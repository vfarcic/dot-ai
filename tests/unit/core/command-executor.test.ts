/**
 * Unit Tests: Command Executor
 *
 * Tests the command executor logging behavior.
 * PRD #343: Commands are executed through the plugin system via shell_exec tool.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { executeCommands } from '../../../src/core/command-executor';

describe('CommandExecutor', () => {
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  let mockPluginManager: {
    invokeTool: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };
    mockPluginManager = {
      invokeTool: vi.fn()
    };
  });

  describe('Logging Behavior', () => {
    test('should use DEBUG level for per-command execution logs', async () => {
      // Mock successful plugin responses with data field
      mockPluginManager.invokeTool.mockResolvedValue({
        success: true,
        result: { data: 'output' }
      });

      await executeCommands(
        ['echo hello', 'echo world'],
        mockLogger as any,
        mockPluginManager as any,
        { context: 'test' }
      );

      // Per-command logs should use DEBUG
      const debugCalls = mockLogger.debug.mock.calls;
      const executingLogs = debugCalls.filter((call: any[]) =>
        call[0]?.includes('Executing command')
      );
      const succeededLogs = debugCalls.filter((call: any[]) =>
        call[0]?.includes('succeeded')
      );

      expect(executingLogs.length).toBe(2);
      expect(succeededLogs.length).toBe(2);
    });

    test('should use INFO level for summary logs', async () => {
      // Mock successful plugin responses with data field
      mockPluginManager.invokeTool.mockResolvedValue({
        success: true,
        result: { data: 'output' }
      });

      await executeCommands(
        ['echo hello', 'echo world'],
        mockLogger as any,
        mockPluginManager as any,
        { context: 'test execution' }
      );

      // Summary logs should use INFO
      const infoCalls = mockLogger.info.mock.calls;

      // Check for starting log
      const startingLog = infoCalls.find((call: any[]) =>
        call[0]?.includes('Starting')
      );
      expect(startingLog).toBeDefined();
      expect(startingLog[1]).toHaveProperty('commandCount', 2);

      // Check for completion log
      const completedLog = infoCalls.find((call: any[]) =>
        call[0]?.includes('completed')
      );
      expect(completedLog).toBeDefined();
      expect(completedLog[1]).toHaveProperty('successCount', 2);
      expect(completedLog[1]).toHaveProperty('failureCount', 0);
    });

    test('should not use INFO for per-command logs', async () => {
      // Mock successful plugin response with data field
      mockPluginManager.invokeTool.mockResolvedValue({
        success: true,
        result: { data: 'output' }
      });

      await executeCommands(
        ['echo hello'],
        mockLogger as any,
        mockPluginManager as any
      );

      // INFO should NOT contain per-command logs
      const infoCalls = mockLogger.info.mock.calls;
      const perCommandInfoLogs = infoCalls.filter((call: any[]) =>
        call[0]?.includes('Executing command') || call[0]?.includes('Command 1 succeeded')
      );

      expect(perCommandInfoLogs.length).toBe(0);
    });
  });

  describe('Execution Results', () => {
    test('should return results for successful commands', async () => {
      // Mock successful plugin response with data field
      mockPluginManager.invokeTool.mockResolvedValue({
        success: true,
        result: { data: 'output' }
      });

      const { results, overallSuccess } = await executeCommands(
        ['echo hello'],
        mockLogger as any,
        mockPluginManager as any
      );

      expect(overallSuccess).toBe(true);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].output).toBe('output');
    });

    test('should continue on error and report failures', async () => {
      mockPluginManager.invokeTool
        .mockResolvedValueOnce({ success: true, result: { data: 'first' } })
        .mockResolvedValueOnce({ success: false, error: { message: 'command failed' } })
        .mockResolvedValueOnce({ success: true, result: { data: 'third' } });

      const { results, overallSuccess } = await executeCommands(
        ['cmd1', 'cmd2', 'cmd3'],
        mockLogger as any,
        mockPluginManager as any
      );

      expect(overallSuccess).toBe(false);
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('command failed');
      expect(results[2].success).toBe(true);
    });
  });
});
