/**
 * Unit tests for runQueryLoopWithRetry — the query tool's bounded retry.
 *
 * The query tool loop is read-only, and a non-success status is a transient,
 * retryable AI failure. These tests verify the retry/backoff behavior
 * deterministically (no cluster, no AI): a transient failure is retried up to
 * maxAttempts, an undefined status is terminal, and the injected backoff runs
 * once per retry.
 */

import { describe, test, expect, vi } from 'vitest';
import { runQueryLoopWithRetry } from '../../../src/tools/query.js';

// Only `.warn` is exercised; a loose stub keeps the test free of the real logger.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopLogger: any = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

// Minimal AgenticResult-shaped value for the retry logic (only `status` matters).
function mkResult(status: 'success' | 'failed' | 'timeout' | 'parse_error' | undefined) {
  return { finalMessage: `msg-${status}`, iterations: 1, toolCallsExecuted: [], status };
}

const noBackoff = () => 0;

describe('runQueryLoopWithRetry', () => {
  test('returns immediately when the first attempt succeeds', async () => {
    const run = vi.fn().mockResolvedValue(mkResult('success'));
    const result = await runQueryLoopWithRetry(run, {
      maxAttempts: 3, logger: noopLogger, requestId: 'r', backoffMs: noBackoff,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
  });

  test('retries a transient failure and returns the first success', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(mkResult('failed'))
      .mockResolvedValueOnce(mkResult('success'));
    const result = await runQueryLoopWithRetry(run, {
      maxAttempts: 3, logger: noopLogger, requestId: 'r', backoffMs: noBackoff,
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('success');
  });

  test('stops after maxAttempts and surfaces the last failure', async () => {
    const run = vi.fn().mockResolvedValue(mkResult('failed'));
    const result = await runQueryLoopWithRetry(run, {
      maxAttempts: 3, logger: noopLogger, requestId: 'r', backoffMs: noBackoff,
    });
    expect(run).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('failed');
  });

  test('treats an undefined status as terminal and does not retry', async () => {
    const run = vi.fn().mockResolvedValue(mkResult(undefined));
    const result = await runQueryLoopWithRetry(run, {
      maxAttempts: 3, logger: noopLogger, requestId: 'r', backoffMs: noBackoff,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.status).toBeUndefined();
  });

  test('invokes the backoff once per retry with the attempt number', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(mkResult('timeout'))
      .mockResolvedValueOnce(mkResult('timeout'))
      .mockResolvedValueOnce(mkResult('success'));
    const backoff = vi.fn().mockReturnValue(0);
    await runQueryLoopWithRetry(run, {
      maxAttempts: 5, logger: noopLogger, requestId: 'r', backoffMs: backoff,
    });
    expect(run).toHaveBeenCalledTimes(3);
    expect(backoff).toHaveBeenCalledTimes(2);
    expect(backoff).toHaveBeenNthCalledWith(1, 1);
    expect(backoff).toHaveBeenNthCalledWith(2, 2);
  });
});
