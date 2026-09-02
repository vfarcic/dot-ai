/**
 * A vitest mock that actually satisfies the production `Logger` interface.
 *
 * Tests used to build a partial `{ info, warn, error, debug }` object and cast
 * it with `as any`, because `Logger` also requires `fatal` — so the cast was
 * hiding a genuinely incomplete mock rather than just quieting the compiler.
 *
 * Each method is typed with its real signature, which means `.mock.calls` is
 * typed too: `mockLogger.warn.mock.calls[0][0]` is a `string`, so call-site
 * predicates need no annotation.
 */

import { vi } from 'vitest';
import type { Logger } from '../../../src/core/error-handling.js';
import type { AppError } from '../../../src/core/error-handling.js';

type LogFn = (message: string, data?: Record<string, unknown>) => void;
type ErrorLogFn = (
  message: string,
  error?: Error | AppError,
  data?: Record<string, unknown>
) => void;

export interface MockLogger extends Logger {
  debug: ReturnType<typeof vi.fn<LogFn>>;
  info: ReturnType<typeof vi.fn<LogFn>>;
  warn: ReturnType<typeof vi.fn<LogFn>>;
  error: ReturnType<typeof vi.fn<ErrorLogFn>>;
  fatal: ReturnType<typeof vi.fn<ErrorLogFn>>;
}

export function createMockLogger(): MockLogger {
  return {
    debug: vi.fn<LogFn>(),
    info: vi.fn<LogFn>(),
    warn: vi.fn<LogFn>(),
    error: vi.fn<ErrorLogFn>(),
    fatal: vi.fn<ErrorLogFn>(),
  };
}

/**
 * A Logger that discards everything, for tests that need the dependency but
 * never assert on it.
 */
export function createNoopLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  };
}
