/**
 * Unit Tests: MCP progress-notification plumbing (PRD #705)
 *
 * These cover the two non-negotiables from the PRD without standing up a
 * server or client:
 *   1. No `progressToken` → no reporter, so non-opt-in and REST callers stay
 *      byte-identical (no notifications ever emitted).
 *   2. A failed notification is swallowed (routed to onError) and never
 *      propagates into the tool call.
 * Plus the time-based heartbeat contract: fixed-interval emission, unref'd
 * timer, and clean stop with no further emission.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestContext,
  reportProgress,
  buildProgressReporter,
  startProgressHeartbeat,
  progressHeartbeatIntervalMs,
  type ProgressNotificationSource,
} from '../../../src/interfaces/request-context';

describe('buildProgressReporter (PRD #705 M1)', () => {
  test('returns undefined when the client did not send a progressToken', () => {
    const extra: ProgressNotificationSource = {
      _meta: {},
      sendNotification: vi.fn().mockResolvedValue(undefined),
    };
    expect(buildProgressReporter(extra)).toBeUndefined();
  });

  test('returns undefined when the transport cannot send notifications', () => {
    const extra: ProgressNotificationSource = { _meta: { progressToken: 42 } };
    expect(buildProgressReporter(extra)).toBeUndefined();
  });

  test('treats progressToken 0 as a valid opt-in', () => {
    const extra: ProgressNotificationSource = {
      _meta: { progressToken: 0 },
      sendNotification: vi.fn().mockResolvedValue(undefined),
    };
    expect(buildProgressReporter(extra)).toBeInstanceOf(Function);
  });

  test('emits a well-formed notifications/progress message', () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const report = buildProgressReporter({
      _meta: { progressToken: 'abc' },
      sendNotification,
    });
    report?.(3, 5, 'Generating configuration options…');
    expect(sendNotification).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: {
        progressToken: 'abc',
        progress: 3,
        total: 5,
        message: 'Generating configuration options…',
      },
    });
  });

  test('a failed notification is swallowed and routed to onError', async () => {
    const failure = new Error('socket closed');
    const sendNotification = vi.fn().mockRejectedValue(failure);
    const onError = vi.fn();
    const report = buildProgressReporter(
      { _meta: { progressToken: 1 }, sendNotification },
      onError
    );
    expect(() => report?.(1)).not.toThrow();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(failure);
  });
});

describe('reportProgress (PRD #705 M1)', () => {
  test('is a no-op outside a request context', () => {
    expect(() => reportProgress(1, 2, 'x')).not.toThrow();
  });

  test('forwards to the context reporter when present', () => {
    const reporter = vi.fn();
    requestContext.run({ progress: reporter }, () => {
      reportProgress(2, 4, 'phase');
    });
    expect(reporter).toHaveBeenCalledWith(2, 4, 'phase');
  });

  test('is a no-op when the context has no reporter', () => {
    requestContext.run({}, () => {
      expect(() => reportProgress(1)).not.toThrow();
    });
  });
});

describe('startProgressHeartbeat (PRD #705 M2)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('emits on a fixed interval until stopped', () => {
    const report = vi.fn();
    const stop = startProgressHeartbeat(report, 'recommend', 1000);
    expect(report).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith(2, undefined, 'recommend in progress…');
    stop();
    vi.advanceTimersByTime(5000);
    expect(report).toHaveBeenCalledTimes(2);
  });

  test('unrefs the timer so it never keeps the process alive', () => {
    const unref = vi.fn();
    vi.spyOn(global, 'setInterval').mockReturnValue({ unref } as never);
    const stop = startProgressHeartbeat(vi.fn(), 'query', 1000);
    expect(unref).toHaveBeenCalled();
    stop();
  });
});

describe('progressHeartbeatIntervalMs (PRD #705 M2)', () => {
  const original = process.env.DOT_AI_MCP_PROGRESS_INTERVAL_MS;
  afterEach(() => {
    if (original === undefined) delete process.env.DOT_AI_MCP_PROGRESS_INTERVAL_MS;
    else process.env.DOT_AI_MCP_PROGRESS_INTERVAL_MS = original;
  });

  test('defaults to 20s', () => {
    delete process.env.DOT_AI_MCP_PROGRESS_INTERVAL_MS;
    expect(progressHeartbeatIntervalMs()).toBe(20_000);
  });

  test('honors a valid positive override', () => {
    process.env.DOT_AI_MCP_PROGRESS_INTERVAL_MS = '5000';
    expect(progressHeartbeatIntervalMs()).toBe(5000);
  });

  test('falls back to the default on invalid or non-positive values', () => {
    process.env.DOT_AI_MCP_PROGRESS_INTERVAL_MS = 'not-a-number';
    expect(progressHeartbeatIntervalMs()).toBe(20_000);
    process.env.DOT_AI_MCP_PROGRESS_INTERVAL_MS = '0';
    expect(progressHeartbeatIntervalMs()).toBe(20_000);
  });
});
