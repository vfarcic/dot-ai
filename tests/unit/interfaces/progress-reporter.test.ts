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
    const channel = buildProgressReporter(extra);
    expect(channel?.report).toBeInstanceOf(Function);
    expect(channel?.heartbeat).toBeInstanceOf(Function);
  });

  test('emits a well-formed notifications/progress message', () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const channel = buildProgressReporter({
      _meta: { progressToken: 'abc' },
      sendNotification,
    });
    channel?.report(3, 5, 'Generating configuration options…');
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
    const channel = buildProgressReporter(
      { _meta: { progressToken: 1 }, sendNotification },
      onError
    );
    expect(() => channel?.report(1)).not.toThrow();
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

describe('ProgressChannel monotonicity (PRD #705, MCP progress spec)', () => {
  test('keeps one strictly increasing sequence when heartbeats interleave with phases', () => {
    const sent: number[] = [];
    const channel = buildProgressReporter({
      _meta: { progressToken: 7 },
      sendNotification: n => {
        sent.push(n.params.progress);
        return Promise.resolve();
      },
    })!;

    // Interleave semantic phase updates with liveness heartbeats, as happens
    // when the fixed-interval timer fires mid-way through findBestSolutions.
    channel.report(1, 4, 'Searching organizational knowledge…');
    channel.heartbeat('recommend');
    channel.report(2, 4, 'Searching cluster capabilities…');
    channel.heartbeat('recommend');
    channel.heartbeat('recommend');
    channel.report(3, 4, 'Generating configuration options…');
    channel.report(4, 4, 'Generating configuration questions (1/1)…');

    const strictlyIncreasing = sent.every((v, i) => i === 0 || v > sent[i - 1]);
    expect(strictlyIncreasing).toBe(true);
    // Integer phases survive untouched: heartbeat nudges never overtake them.
    expect(sent.filter(Number.isInteger)).toEqual([1, 2, 3, 4]);
  });

  test('a heartbeat before any phase still emits a strictly increasing value', () => {
    const sent: number[] = [];
    const channel = buildProgressReporter({
      _meta: { progressToken: 8 },
      sendNotification: n => {
        sent.push(n.params.progress);
        return Promise.resolve();
      },
    })!;
    channel.heartbeat('recommend');
    channel.report(1, 2, 'phase');
    expect(sent[0]).toBeGreaterThan(0);
    expect(sent[1]).toBeGreaterThan(sent[0]);
  });
});

describe('startProgressHeartbeat (PRD #705 M2)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('emits on a fixed interval until stopped', () => {
    const heartbeat = vi.fn();
    const stop = startProgressHeartbeat(heartbeat, 'recommend', 1000);
    expect(heartbeat).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    expect(heartbeat).toHaveBeenCalledTimes(2);
    expect(heartbeat).toHaveBeenLastCalledWith('recommend');
    stop();
    vi.advanceTimersByTime(5000);
    expect(heartbeat).toHaveBeenCalledTimes(2);
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
    if (original === undefined)
      delete process.env.DOT_AI_MCP_PROGRESS_INTERVAL_MS;
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
