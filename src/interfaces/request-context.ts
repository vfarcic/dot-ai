/**
 * Request-scoped context using AsyncLocalStorage (PRD #380 Task 2.4).
 *
 * Propagates UserIdentity from the auth check in mcp.ts through to
 * tool handlers without changing any handler signatures. Works across
 * both REST API and MCP protocol paths.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserIdentity } from './oauth/types';

export interface RequestContext {
  identity?: UserIdentity;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current user identity from the request context.
 * Returns undefined when called outside a request context.
 */
export function getCurrentIdentity(): UserIdentity | undefined {
  return requestContext.getStore()?.identity;
}
