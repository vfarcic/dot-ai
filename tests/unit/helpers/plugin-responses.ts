/**
 * Builders for valid `InvokeResponse` values.
 *
 * Inline literals in tests routinely omitted `sessionId`, `state`, or the error
 * `code`, all of which the real invoke hook always sends — mocks that were
 * quietly unfaithful in a way only typechecking surfaced (#784).
 */

import type { InvokeResponse } from '../../../src/core/plugin-types.js';

export function invokeSuccess(
  result: unknown,
  sessionId = 'test-session'
): InvokeResponse {
  return { sessionId, success: true, result, state: {} };
}

export function invokeError(
  message: string,
  code = 'PLUGIN_ERROR',
  sessionId = 'test-session'
): InvokeResponse {
  return { sessionId, success: false, error: { code, message }, state: {} };
}
