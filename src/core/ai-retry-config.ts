/**
 * AI SDK Retry Configuration
 *
 * Resolves the `maxRetries` value passed to Vercel AI SDK calls per operation
 * type. Different operations have different sensitivity profiles:
 *
 *   embeddings: batch/background work, resilience over latency, higher retries
 *   chat:       interactive request/response, fail fast for responsiveness
 *   tool_loop:  multi-step agentic loops, moderate retries per step
 *   wrap_up:    final summary call after a tool loop, fail fast (we already
 *               have a partial answer to fall back to)
 *
 * Defaults can be overridden globally or per-operation via env vars:
 *
 *   DOT_AI_AI_MAX_RETRIES                  global default for all operations
 *   DOT_AI_AI_MAX_RETRIES_EMBEDDINGS       embeddings only
 *   DOT_AI_AI_MAX_RETRIES_CHAT             single-turn chat only
 *   DOT_AI_AI_MAX_RETRIES_TOOL_LOOP        agentic tool loop only
 *   DOT_AI_AI_MAX_RETRIES_WRAP_UP          wrap-up call after the tool loop
 *
 * Per-operation env vars take precedence over the global one. Invalid values
 * (non-integer, negative, NaN) are ignored and the next fallback is used.
 */

export type AIOperation = 'embeddings' | 'chat' | 'tool_loop' | 'wrap_up';

/**
 * Per-operation defaults. The Vercel AI SDK itself defaults to 2 retries (3
 * total attempts). We keep that for interactive paths and increase only for
 * embeddings, which are typically background/batch and benefit from a few
 * extra attempts under transient provider hiccups.
 */
const DEFAULT_MAX_RETRIES: Record<AIOperation, number> = {
  embeddings: 4,
  chat: 2,
  tool_loop: 2,
  wrap_up: 1,
};

const PER_OP_ENV_VAR: Record<AIOperation, string> = {
  embeddings: 'DOT_AI_AI_MAX_RETRIES_EMBEDDINGS',
  chat: 'DOT_AI_AI_MAX_RETRIES_CHAT',
  tool_loop: 'DOT_AI_AI_MAX_RETRIES_TOOL_LOOP',
  wrap_up: 'DOT_AI_AI_MAX_RETRIES_WRAP_UP',
};

const GLOBAL_ENV_VAR = 'DOT_AI_AI_MAX_RETRIES';

/**
 * Parse a non-negative integer from a string, or return undefined for
 * anything that is not a valid count. Empty / whitespace-only / negative /
 * non-numeric values all fall back to undefined.
 */
function parseRetryCount(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  // Reject anything that isn't a pure non-negative integer literal.
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

/**
 * Resolve `maxRetries` for the given operation. Precedence:
 *   1. per-operation env var (if set and valid)
 *   2. global env var (if set and valid)
 *   3. per-operation default
 */
export function getMaxRetries(
  operation: AIOperation,
  env: NodeJS.ProcessEnv = process.env
): number {
  const perOp = parseRetryCount(env[PER_OP_ENV_VAR[operation]]);
  if (perOp !== undefined) return perOp;

  const global = parseRetryCount(env[GLOBAL_ENV_VAR]);
  if (global !== undefined) return global;

  return DEFAULT_MAX_RETRIES[operation];
}

/**
 * Exported for tests that want to assert the configured defaults without
 * setting env vars.
 */
export const __defaults: Readonly<Record<AIOperation, number>> = Object.freeze({
  ...DEFAULT_MAX_RETRIES,
});
