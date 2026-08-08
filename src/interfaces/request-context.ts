/**
 * Request-scoped context using AsyncLocalStorage (PRD #380 Task 2.4).
 *
 * Propagates UserIdentity from the auth check in mcp.ts through to
 * tool handlers without changing any handler signatures. Works across
 * both REST API and MCP protocol paths.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserIdentity } from './oauth/types';

/**
 * Emits an MCP `notifications/progress` for the in-flight request (PRD #705).
 * Only installed when the client opted in with a `progressToken`; the field is
 * simply absent otherwise, so non-opt-in and REST callers stay byte-identical.
 */
export type ProgressReporter = (
  progress: number,
  total?: number,
  message?: string
) => void;

export interface RequestContext {
  identity?: UserIdentity;
  progress?: ProgressReporter;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current user identity from the request context.
 * Returns undefined when called outside a request context.
 */
export function getCurrentIdentity(): UserIdentity | undefined {
  return requestContext.getStore()?.identity;
}

/**
 * Coarse phase count for a `recommend` call, used as the `total` on every
 * progress notification it emits (PRD #705).
 *
 * The four phases are: organizational knowledge, cluster capabilities, solution
 * assembly, and the final per-solution step (question generation, or Helm chart
 * selection on that branch). The final phase is subdivided fractionally because
 * the solution count is AI-determined and unknown until assembly returns —
 * fixing `total` up front is what lets a client render a bar from the very first
 * notification without the ratio jumping backwards when the count arrives.
 */
export const RECOMMEND_PROGRESS_PHASES = 4;

/**
 * Report progress on the current MCP tool call (PRD #705). No-op outside a
 * request context or when the client did not send a `progressToken`.
 */
export function reportProgress(
  progress: number,
  total?: number,
  message?: string
): void {
  requestContext.getStore()?.progress?.(progress, total, message);
}

interface ProgressNotification {
  method: 'notifications/progress';
  params: {
    progressToken: string | number;
    progress: number;
    total?: number;
    message?: string;
  };
}

/**
 * Minimal view of the MCP SDK per-request `extra` needed to emit progress.
 * Carries the opt-in `progressToken` and the request-scoped notification sender.
 */
export interface ProgressNotificationSource {
  _meta?: { progressToken?: string | number };
  sendNotification?: (notification: ProgressNotification) => Promise<void>;
}

/**
 * A single request-scoped progress sequence for one `progressToken` (PRD #705).
 * `report` carries semantic phase updates (monotonic integers with a known
 * `total`); `heartbeat` emits liveness-only nudges. Both share one strictly
 * increasing `progress` value so the token never violates the MCP requirement
 * that `progress` increase with every notification.
 */
export interface ProgressChannel {
  report: ProgressReporter;
  heartbeat: (label: string) => void;
}

/**
 * Smallest step used to keep the sequence strictly increasing. A heartbeat nudge
 * of this size cannot overtake the next integer phase within any realistic call
 * duration (~1000 nudges to advance a whole phase), so the semantic `progress`
 * value and its `total` ratio stay intact for a client progress bar.
 */
const MIN_PROGRESS_STEP = 0.001;

/**
 * Build a ProgressChannel from the MCP SDK's per-request `extra` (PRD #705).
 * Returns undefined when the client did not opt in with `_meta.progressToken`
 * or the transport cannot send notifications, keeping non-opt-in and REST
 * calls unaffected. Emit failures are routed to `onError` and never propagate
 * into the tool call.
 */
export function buildProgressReporter(
  extra: ProgressNotificationSource,
  onError?: (error: unknown) => void
): ProgressChannel | undefined {
  const progressToken = extra?._meta?.progressToken;
  const sendNotification = extra?.sendNotification;
  if (progressToken === undefined || progressToken === null || !sendNotification) {
    return undefined;
  }

  // Shared state so heartbeat and semantic updates form one monotonic sequence.
  let last = 0;
  let total: number | undefined;
  let message: string | undefined;

  const send = (progress: number) => {
    sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress, total, message },
    }).catch(error => onError?.(error));
  };

  return {
    report: (progress, nextTotal, nextMessage) => {
      last = Math.max(progress, last + MIN_PROGRESS_STEP);
      if (nextTotal !== undefined) total = nextTotal;
      if (nextMessage !== undefined) message = nextMessage;
      send(last);
    },
    heartbeat: label => {
      // Nudge without advancing the phase, reusing the current phase message.
      last += MIN_PROGRESS_STEP;
      const previousMessage = message;
      message = previousMessage ?? `${label} in progress…`;
      send(last);
      message = previousMessage;
    },
  };
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Heartbeat interval in milliseconds, configurable via
 * `DOT_AI_MCP_PROGRESS_INTERVAL_MS` and defaulting to ~20s — comfortably inside
 * a typical 60s proxy/LB idle timeout (PRD #705).
 */
export function progressHeartbeatIntervalMs(): number {
  const raw = Number(process.env.DOT_AI_MCP_PROGRESS_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HEARTBEAT_INTERVAL_MS;
}

/**
 * Start a time-based liveness heartbeat that emits progress on a fixed interval
 * until the returned stop function is called (PRD #705). Guarantees bytes flow
 * during otherwise-silent blocking phases so an idle proxy/LB does not drop the
 * connection. The timer is unref'd so it never keeps the process alive; callers
 * must invoke the returned stop function in a `finally` to avoid timer leaks.
 */
export function startProgressHeartbeat(
  heartbeat: (label: string) => void,
  label: string,
  intervalMs: number = progressHeartbeatIntervalMs()
): () => void {
  const timer = setInterval(() => heartbeat(label), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
