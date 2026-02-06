/**
 * Request Context Module
 *
 * PRD #360: User Authentication & Access Control
 *
 * Uses AsyncLocalStorage to propagate per-request context (including
 * authenticated user identity) to all code running within a request,
 * without requiring changes to function signatures.
 *
 * This follows the same pattern as OpenTelemetry context propagation.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserContext } from './auth-oauth';

/**
 * Context available to all code within a single HTTP request
 */
export interface RequestContext {
  /** Authenticated user, if any */
  user?: UserContext;
  /** Whether the authenticated user is an admin (token-based auth) */
  isAdmin?: boolean;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run an async function with request context available via getCurrentUser().
 * All code executed within `fn` (including nested async calls) will have
 * access to the request context.
 *
 * @param ctx - The request context to propagate
 * @param fn - The async function to execute within the context
 * @returns The return value of fn
 */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContextStorage.run(ctx, fn);
}

/**
 * Get the authenticated user from the current request context.
 * Returns undefined if no user is authenticated or if called outside
 * a request context.
 *
 * Tool handlers, audit logging, and any other code in the request
 * call chain can use this to access the authenticated user identity.
 */
export function getCurrentUser(): UserContext | undefined {
  return requestContextStorage.getStore()?.user;
}

/**
 * Get the full request context for the current request.
 * Returns undefined if called outside a request context.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
