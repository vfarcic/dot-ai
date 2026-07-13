/**
 * Redaction of credential-bearing request headers before they are logged.
 *
 * The front HTTP layer (mcp.ts) logs incoming requests at debug level. Logging
 * `req.headers` verbatim would leak credentials — `Authorization`,
 * `X-Dot-AI-Authorization`, and (PRD #621) the per-request `X-Dot-AI-Git-Token`
 * — bypassing the loader-level scrubbing. PRD #621 requires the forwarded token
 * NEVER appear in logs, so these header values are replaced with a fixed
 * placeholder before logging.
 *
 * Kept in its own module so the redaction is unit-testable without importing
 * the heavy mcp.ts server module.
 */

import { GIT_TOKEN_HEADER_LC } from './cors-headers';

/** Fixed placeholder substituted for a redacted header value. */
export const REDACTED_PLACEHOLDER = '***REDACTED***';

/**
 * Lowercased names of headers whose values are credential-bearing and must be
 * redacted before logging. Node lowercases all incoming header names, so the
 * comparison is done in lowercase.
 */
export const SENSITIVE_HEADER_NAMES: ReadonlySet<string> = new Set([
  'authorization',
  'x-dot-ai-authorization',
  GIT_TOKEN_HEADER_LC,
  'cookie',
  'proxy-authorization',
]);

/**
 * Return a shallow copy of `headers` with the value of every credential-bearing
 * header replaced by REDACTED_PLACEHOLDER. Non-sensitive headers are preserved
 * verbatim. The input object is never mutated.
 */
export function redactSensitiveHeaders(
  headers: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!headers) return {};
  const redacted: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = SENSITIVE_HEADER_NAMES.has(name.toLowerCase())
      ? REDACTED_PLACEHOLDER
      : value;
  }
  return redacted;
}
