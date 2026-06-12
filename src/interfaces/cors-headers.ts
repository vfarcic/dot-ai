/**
 * Shared CORS allow-header lists (PRD #621 M2, Decision 1).
 *
 * The REST (src/interfaces/rest-api.ts) and front HTTP (src/interfaces/mcp.ts)
 * layers each answer CORS preflight with their own `Access-Control-Allow-Headers`
 * value, and the two were historically OUT OF SYNC. Centralizing the credential
 * header name here guarantees the new `X-Dot-AI-Git-Token` header is advertised
 * by BOTH preflight responses (Decision 1) and that the two lists can never
 * silently drift apart on this header again.
 *
 * The two lists intentionally differ on the OTHER headers (mcp.ts also allows
 * X-Session-Id / X-Dot-AI-Authorization), which is preserved.
 */

/**
 * Per-request git credential header (PRD #621 M2/M3, Decision 1). The CLI
 * forwards its `DOT_AI_GIT_TOKEN` here so the server can authenticate an
 * overridden (`?repo=`) clone against a second auth realm. Always a request
 * header — never a query param or body field.
 */
export const GIT_TOKEN_HEADER = 'X-Dot-AI-Git-Token';

/**
 * Lowercased form for reading the header off Node's `req.headers` (Node
 * lowercases all incoming header names).
 */
export const GIT_TOKEN_HEADER_LC = GIT_TOKEN_HEADER.toLowerCase();

/**
 * `Access-Control-Allow-Headers` value for the REST API layer
 * (rest-api.ts `setCorsHeaders`).
 */
export const REST_CORS_ALLOW_HEADERS = `Content-Type, Authorization, ${GIT_TOKEN_HEADER}`;

/**
 * `Access-Control-Allow-Headers` value for the front HTTP layer (mcp.ts).
 * Retains X-Session-Id and X-Dot-AI-Authorization from the pre-existing list.
 */
export const MCP_CORS_ALLOW_HEADERS = `Content-Type, X-Session-Id, Authorization, X-Dot-AI-Authorization, ${GIT_TOKEN_HEADER}`;
