/**
 * Unit Tests: Command Executor
 *
 * Tests the command executor logging behavior and execution patterns.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { executeCommands } from '../../../src/core/command-executor';

// Mock platform-utils
vi.mock('../../../src/core/platform-utils.js', () => ({
  execAsync: vi.fn()
}));

describe('Command Executor', () => {
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    vi.clearAllMocks();
  });

  describe('Logging Behavior', () => {
    test('should use DEBUG level for per-command execution logs', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'output' });

      await executeCommands(['echo test', 'echo test2'], mockLogger as any);

      // Per-command "Executing command" logs should be DEBUG
      const debugCalls = mockLogger.debug.mock.calls;
      const executingLogs = debugCalls.filter(call =>
        call[0]?.includes('Executing command')
      );
      expect(executingLogs.length).toBe(2);

      // Per-command "succeeded" logs should be DEBUG
      const succeededLogs = debugCalls.filter(call =>
        call[0]?.includes('succeeded')
      );
      expect(succeededLogs.length).toBe(2);
    });

    test('should NOT use INFO level for per-command logs', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'output' });

      await executeCommands(['echo test', 'echo test2'], mockLogger as any);

      // INFO logs should NOT contain per-command execution messages
      const infoCalls = mockLogger.info.mock.calls;
      const perCommandInfoLogs = infoCalls.filter(call =>
        call[0]?.includes('Executing command') || call[0]?.match(/Command \d+ succeeded/)
      );
      expect(perCommandInfoLogs.length).toBe(0);
    });

    test('should use INFO level for summary logs only', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'output' });

      await executeCommands(['echo test', 'echo test2'], mockLogger as any, {
        context: 'test execution'
      });

      const infoCalls = mockLogger.info.mock.calls;

      // Should have start log
      const startLog = infoCalls.find(call =>
        call[0]?.includes('Starting test execution')
      );
      expect(startLog).toBeDefined();

      // Should have completion summary log
      const completionLog = infoCalls.find(call =>
        call[0]?.includes('test execution completed')
      );
      expect(completionLog).toBeDefined();
      expect(completionLog[1]).toHaveProperty('successCount', 2);
      expect(completionLog[1]).toHaveProperty('failureCount', 0);
    });

    test('should use ERROR level for failed commands', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('command failed'));

      await executeCommands(['failing-command'], mockLogger as any);

      // Failed command should log at ERROR level
      const errorCalls = mockLogger.error.mock.calls;
      const failedLog = errorCalls.find(call =>
        call[0]?.includes('failed')
      );
      expect(failedLog).toBeDefined();
    });

    test('should include success and failure counts in summary', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ stdout: 'success1' })
        .mockRejectedValueOnce(new Error('failed'))
        .mockResolvedValueOnce({ stdout: 'success2' });

      await executeCommands(['cmd1', 'cmd2', 'cmd3'], mockLogger as any, {
        context: 'mixed execution'
      });

      const infoCalls = mockLogger.info.mock.calls;
      const completionLog = infoCalls.find(call =>
        call[0]?.includes('mixed execution completed')
      );
      expect(completionLog).toBeDefined();
      expect(completionLog[1]).toHaveProperty('successCount', 2);
      expect(completionLog[1]).toHaveProperty('failureCount', 1);
    });
  });

  describe('Execution Behavior', () => {
    test('should execute all commands even if some fail', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ stdout: 'success1' })
        .mockRejectedValueOnce(new Error('failed'))
        .mockResolvedValueOnce({ stdout: 'success2' });

      const { results, overallSuccess } = await executeCommands(
        ['cmd1', 'cmd2', 'cmd3'],
        mockLogger as any
      );

      expect(results.length).toBe(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(overallSuccess).toBe(false);
    });

    test('should return true for overallSuccess when all commands succeed', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'output' });

      const { overallSuccess } = await executeCommands(
        ['cmd1', 'cmd2'],
        mockLogger as any
      );

      expect(overallSuccess).toBe(true);
    });

    test('should clean escape sequences from commands', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'output' });

      await executeCommands(['echo \\"test\\"'], mockLogger as any);

      expect(execAsync).toHaveBeenCalledWith('echo "test"');
    });

    test('should include command in result', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'output' });

      const { results } = await executeCommands(['echo test'], mockLogger as any);

      expect(results[0].command).toBe('echo test');
    });

    test('should include timestamp in result', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'output' });

      const { results } = await executeCommands(['echo test'], mockLogger as any);

      expect(results[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Options', () => {
    test('should include sessionId in logs', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'output' });

      await executeCommands(['echo test'], mockLogger as any, {
        sessionId: 'test-session-123'
      });

      const infoCalls = mockLogger.info.mock.calls;
      const logWithSession = infoCalls.find(call =>
        call[1]?.sessionId === 'test-session-123'
      );
      expect(logWithSession).toBeDefined();
    });

    test('should include custom logMetadata in logs', async () => {
      const { execAsync } = await import('../../../src/core/platform-utils.js');
      (execAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: 'output' });

      await executeCommands(['echo test'], mockLogger as any, {
        logMetadata: { customField: 'customValue' }
      });

      const infoCalls = mockLogger.info.mock.calls;
      const logWithMetadata = infoCalls.find(call =>
        call[1]?.customField === 'customValue'
      );
      expect(logWithMetadata).toBeDefined();
    });
  });
});
