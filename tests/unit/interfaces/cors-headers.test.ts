/**
 * Unit Tests: CORS allow-header parity (PRD #621 M2, Decision 1)
 *
 * The new X-Dot-AI-Git-Token credential header must be advertised by BOTH CORS
 * preflight responses — the REST layer (rest-api.ts setCorsHeaders) and the
 * front HTTP layer (mcp.ts). Historically these two allowlists were out of
 * sync; cors-headers.ts is now the single source of truth for the credential
 * header so they can never silently drift apart on it again.
 *
 * These constants are the EXACT strings emitted in the Access-Control-Allow-
 * Headers response header by each layer (rest-api.ts and mcp.ts both import
 * them), so asserting on them here is equivalent to asserting on the wire
 * value without needing to stand up either server.
 */

import { describe, test, expect } from 'vitest';
import {
  GIT_TOKEN_HEADER,
  GIT_TOKEN_HEADER_LC,
  REST_CORS_ALLOW_HEADERS,
  MCP_CORS_ALLOW_HEADERS,
} from '../../../src/interfaces/cors-headers';

describe('CORS allow-header parity (PRD #621 M2)', () => {
  test('the credential header name is X-Dot-AI-Git-Token', () => {
    expect(GIT_TOKEN_HEADER).toBe('X-Dot-AI-Git-Token');
  });

  test('the lowercased form matches Node req.headers keys', () => {
    expect(GIT_TOKEN_HEADER_LC).toBe('x-dot-ai-git-token');
  });

  test('REST allowlist (rest-api.ts setCorsHeaders) advertises the header', () => {
    expect(REST_CORS_ALLOW_HEADERS).toContain(GIT_TOKEN_HEADER);
    // Preserves the pre-existing REST headers.
    expect(REST_CORS_ALLOW_HEADERS).toContain('Content-Type');
    expect(REST_CORS_ALLOW_HEADERS).toContain('Authorization');
  });

  test('MCP allowlist (mcp.ts) advertises the header', () => {
    expect(MCP_CORS_ALLOW_HEADERS).toContain(GIT_TOKEN_HEADER);
    // Preserves the pre-existing MCP headers (which differ from REST by design).
    expect(MCP_CORS_ALLOW_HEADERS).toContain('Content-Type');
    expect(MCP_CORS_ALLOW_HEADERS).toContain('X-Session-Id');
    expect(MCP_CORS_ALLOW_HEADERS).toContain('Authorization');
    expect(MCP_CORS_ALLOW_HEADERS).toContain('X-Dot-AI-Authorization');
  });

  // CodeRabbit Finding 3: the MCP session router routes by the
  // `mcp-session-id` request header, so the preflight allowlist must advertise
  // it (case-insensitively) or browser MCP calls that send it would fail.
  test('MCP allowlist advertises the session-routing header (Mcp-Session-Id)', () => {
    expect(MCP_CORS_ALLOW_HEADERS).toContain('Mcp-Session-Id');
    expect(MCP_CORS_ALLOW_HEADERS.toLowerCase()).toContain('mcp-session-id');
    // X-Session-Id is retained for backward compat (additive change).
    expect(MCP_CORS_ALLOW_HEADERS).toContain('X-Session-Id');
  });

  test('BOTH allowlists include the credential header (parity, case-insensitive)', () => {
    for (const list of [REST_CORS_ALLOW_HEADERS, MCP_CORS_ALLOW_HEADERS]) {
      expect(list.toLowerCase()).toContain('x-dot-ai-git-token');
    }
  });
});
