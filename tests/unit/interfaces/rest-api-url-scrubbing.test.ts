/**
 * Unit Tests: sanitizeRequestUrlForLogging (PRD #581 F3)
 *
 * REST API request logging echoes req.url. With PRD #581 the query string
 * may carry `?repo=<user-supplied-url>` whose value can include credentials.
 * The helper must rewrite the `repo` value to its scrubbed form so the raw
 * token never reaches the log.
 */

import { describe, test, expect } from 'vitest';
import { sanitizeRequestUrlForLogging } from '../../../src/interfaces/rest-api';

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
    // The URL is reconstructed but the substantive content is preserved.
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
    // Scrubbed form should include the masked credentials marker.
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
});
