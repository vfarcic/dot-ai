/**
 * Unit Tests: redactSensitiveHeaders (PRD #621 remediation HIGH-1)
 *
 * The front HTTP layer (mcp.ts) logs incoming requests at debug level. Logging
 * req.headers verbatim leaked credential headers — Authorization,
 * X-Dot-AI-Authorization, and (PRD #621) X-Dot-AI-Git-Token — violating the
 * "token never appears in logs" success criterion. This pins the redaction.
 */

import { describe, test, expect } from 'vitest';
import {
  redactSensitiveHeaders,
  REDACTED_PLACEHOLDER,
  SENSITIVE_HEADER_NAMES,
} from '../../../src/interfaces/header-redaction';

describe('redactSensitiveHeaders (PRD #621 HIGH-1)', () => {
  test('redacts X-Dot-AI-Git-Token (the per-request credential)', () => {
    const out = redactSensitiveHeaders({
      'x-dot-ai-git-token': 'ghp_supersecret_value',
      'content-type': 'application/json',
    });
    expect(out['x-dot-ai-git-token']).toBe(REDACTED_PLACEHOLDER);
    // Non-sensitive headers are preserved verbatim.
    expect(out['content-type']).toBe('application/json');
    expect(JSON.stringify(out)).not.toContain('ghp_supersecret_value');
  });

  test('redacts Authorization and X-Dot-AI-Authorization', () => {
    const out = redactSensitiveHeaders({
      authorization: 'Bearer secret-jwt-aaa',
      'x-dot-ai-authorization': 'Bearer secret-jwt-bbb',
    });
    expect(out.authorization).toBe(REDACTED_PLACEHOLDER);
    expect(out['x-dot-ai-authorization']).toBe(REDACTED_PLACEHOLDER);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('secret-jwt-aaa');
    expect(serialized).not.toContain('secret-jwt-bbb');
  });

  test('is case-insensitive on header names', () => {
    const out = redactSensitiveHeaders({
      'X-Dot-AI-Git-Token': 'MixedCaseSecret',
      Authorization: 'Bearer UpperSecret',
    });
    expect(out['X-Dot-AI-Git-Token']).toBe(REDACTED_PLACEHOLDER);
    expect(out.Authorization).toBe(REDACTED_PLACEHOLDER);
    expect(JSON.stringify(out)).not.toContain('Secret');
  });

  test('preserves non-sensitive headers and does not mutate the input', () => {
    const input = {
      'content-type': 'application/json',
      'x-session-id': 'sess-123',
      'user-agent': 'curl/8',
      authorization: 'Bearer keep-out',
    };
    const out = redactSensitiveHeaders(input);
    expect(out['content-type']).toBe('application/json');
    expect(out['x-session-id']).toBe('sess-123');
    expect(out['user-agent']).toBe('curl/8');
    // Input object is untouched.
    expect(input.authorization).toBe('Bearer keep-out');
  });

  test('handles undefined headers', () => {
    expect(redactSensitiveHeaders(undefined)).toEqual({});
  });

  test('the sensitive set includes the credential headers', () => {
    expect(SENSITIVE_HEADER_NAMES.has('x-dot-ai-git-token')).toBe(true);
    expect(SENSITIVE_HEADER_NAMES.has('authorization')).toBe(true);
    expect(SENSITIVE_HEADER_NAMES.has('x-dot-ai-authorization')).toBe(true);
  });
});
