/**
 * Unit Tests: sanitizeRequestUrlForLogging (PRD #581 F3 + CodeRabbit Major B)
 *
 * REST API request logging echoes req.url. With PRD #581 the query string
 * may carry `?repo=<user-supplied-url>` whose value can include credentials.
 * The helper must rewrite the `repo` value to its scrubbed form so the raw
 * token never reaches the log.
 *
 * CodeRabbit Major B added a stricter guard for the catch path: on URL parse
 * failure, the helper redacts the entire query string (keeping just the
 * pathname plus a constant placeholder), rather than echoing the input
 * verbatim. An unparseable URL is more likely than a parseable one to hide
 * a credential, so the catch path must NOT echo the raw query.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeRequestUrlForLogging,
  UNPARSEABLE_QUERY_PLACEHOLDER,
} from '../../../src/interfaces/rest-api';

// Module-scope mock used by the "unparseable input" describe block below.
// `URL` in rest-api.ts is imported from 'node:url', so vi.stubGlobal does NOT
// reach it — we mock 'node:url' for this test file instead. The replacement
// constructor throws ONLY when (process as any).__forceUrlThrow === true and
// the second argument is the exact base the helper uses
// ('http://internal.invalid'). Anywhere else (success-path tests, library
// internals) it falls through to the real URL constructor.
vi.mock('node:url', async () => {
  const actual = await vi.importActual<typeof import('node:url')>('node:url');
  class ConditionallyThrowingURL extends actual.URL {
    constructor(input: string, base?: string | URL) {
      if (
        base === 'http://internal.invalid' &&
        (process as unknown as { __forceUrlThrow?: boolean })
          .__forceUrlThrow === true
      ) {
        throw new Error('mocked URL parser failure');
      }
      super(input, base);
    }
  }
  return { ...actual, URL: ConditionallyThrowingURL };
});

describe('sanitizeRequestUrlForLogging (PRD #581 F3)', () => {
  test('returns undefined as-is', () => {
    expect(sanitizeRequestUrlForLogging(undefined)).toBe(undefined);
  });

  test('returns empty string as-is', () => {
    expect(sanitizeRequestUrlForLogging('')).toBe('');
  });

  test('passes through URLs without a query string', () => {
    expect(sanitizeRequestUrlForLogging('/api/v1/prompts')).toBe(
      '/api/v1/prompts'
    );
  });

  test('passes through URLs without a `repo` query param', () => {
    expect(sanitizeRequestUrlForLogging('/api/v1/prompts?foo=bar')).toBe(
      '/api/v1/prompts?foo=bar'
    );
  });

  test('passes through credential-free `repo` values unchanged', () => {
    const url = '/api/v1/prompts?repo=https%3A%2F%2Fgithub.com%2Forg%2Frepo';
    const result = sanitizeRequestUrlForLogging(url);
    expect(result).toContain('repo=');
    expect(result).toContain('github.com');
    expect(result).toContain('org');
    expect(result).toContain('repo');
  });

  test('scrubs credentials embedded in the `repo` value', () => {
    const url =
      '/api/v1/prompts?repo=https%3A%2F%2Fuser%3As3cret-tok%40github.com%2Forg%2Frepo';
    const result = sanitizeRequestUrlForLogging(url);
    expect(result).toBeDefined();
    expect(result).not.toContain('s3cret-tok');
    expect(decodeURIComponent(result as string)).toContain(
      '***@github.com/org/repo'
    );
  });

  test('preserves other query params alongside the `repo` rewrite', () => {
    const url =
      '/api/v1/prompts?other=v1&repo=https%3A%2F%2Fu%3At%40h%2Fr&another=v2';
    const result = sanitizeRequestUrlForLogging(url);
    expect(result).toBeDefined();
    expect(result).toContain('other=v1');
    expect(result).toContain('another=v2');
    expect(result).not.toContain('u:t@');
  });

  // CodeRabbit Major B: on parse failure, do not echo the raw query string.
  // The WHATWG URL parser in Node is extremely lenient and canonicalizes
  // most malformed inputs rather than throwing, so we mock the URL
  // constructor to throw and pin the catch behavior directly. The behavior
  // we want to guarantee is: "if URL ever throws on us in production, the
  // log line does NOT echo a credential-bearing query string verbatim."
  describe('unparseable input (CodeRabbit Major B)', () => {
    const _proc = process as unknown as { __forceUrlThrow?: boolean };

    beforeEach(() => {
      _proc.__forceUrlThrow = true;
    });

    afterEach(() => {
      delete _proc.__forceUrlThrow;
    });

    test('does not throw on unparseable input', () => {
      expect(() =>
        sanitizeRequestUrlForLogging('/api/v1/prompts?repo=anything')
      ).not.toThrow();
    });

    test('redacts the entire query string when URL fails to parse', () => {
      const result = sanitizeRequestUrlForLogging(
        '/api/v1/prompts?repo=https://x:tok-leaked-xyz@host/r'
      );
      expect(result).toBeDefined();
      // No part of the raw query — including the embedded credential —
      // leaks into the returned log string.
      expect(result).not.toContain('repo=');
      expect(result).not.toContain('tok-leaked-xyz');
      expect(result).not.toContain('x:tok');
      // The pathname is preserved so the log is still useful for triage.
      expect(result).toContain('/api/v1/prompts');
      // The placeholder is a fixed constant for log-grepping.
      expect(result?.endsWith(UNPARSEABLE_QUERY_PLACEHOLDER)).toBe(true);
    });

    test('unparseable URL without a query string is returned unchanged', () => {
      // No `?` short-circuits before we ever enter the parse branch.
      const malformed = '/api/v1/prompts';
      expect(sanitizeRequestUrlForLogging(malformed)).toBe(malformed);
    });
  });
});
