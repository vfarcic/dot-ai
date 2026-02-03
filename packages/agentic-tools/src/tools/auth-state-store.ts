/**
 * OAuth Flow State Store
 *
 * PRD #360: User Authentication & Access Control - Milestone 2
 *
 * In-memory store for OAuth flow state including PKCE code verifiers.
 * State is stored by the `state` parameter and expires after 10 minutes.
 *
 * In production, this could be replaced with Redis or a distributed store
 * for multi-replica deployments.
 */

/**
 * OAuth flow state stored during the authorization flow
 */
export interface OAuthFlowState {
  /** PKCE code verifier (secret, never sent to authorization server) */
  codeVerifier: string;
  /** PKCE code challenge (SHA256 hash of verifier, sent to authorization server) */
  codeChallenge: string;
  /** The redirect URI for this flow */
  redirectUri: string;
  /** Requested OAuth scopes */
  scope: string;
  /** Issuer URL for JWT generation */
  issuer: string;
  /** When this state was created */
  createdAt: Date;
}

/**
 * TTL for OAuth flow state (10 minutes)
 * This is the maximum time between /oauth/authorize and /oauth/callback
 */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Cleanup interval (5 minutes)
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * In-memory store for OAuth flow states
 * Key: state parameter
 * Value: OAuthFlowState
 */
const stateStore = new Map<string, OAuthFlowState>();

/**
 * Cleanup timer reference (for testing cleanup)
 */
let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Start periodic cleanup of expired states
 */
function startCleanupTimer(): void {
  if (cleanupTimer) {
    return;
  }

  cleanupTimer = setInterval(() => {
    cleanupExpiredStates();
  }, CLEANUP_INTERVAL_MS);

  // Don't prevent process exit
  cleanupTimer.unref();
}

/**
 * Stop periodic cleanup (for testing)
 */
export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Remove expired states from the store
 */
function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [state, data] of stateStore.entries()) {
    if (now - data.createdAt.getTime() > STATE_TTL_MS) {
      stateStore.delete(state);
    }
  }
}

/**
 * Store OAuth flow state
 *
 * @param state - The state parameter (unique identifier for this flow)
 * @param data - The flow state data to store
 */
export function storeOAuthFlowState(state: string, data: Omit<OAuthFlowState, 'createdAt'>): void {
  // Start cleanup timer on first store
  startCleanupTimer();

  stateStore.set(state, {
    ...data,
    createdAt: new Date(),
  });
}

/**
 * Retrieve and validate OAuth flow state
 *
 * @param state - The state parameter to look up
 * @returns The flow state if found and not expired, null otherwise
 */
export function getOAuthFlowState(state: string): OAuthFlowState | null {
  const data = stateStore.get(state);

  if (!data) {
    return null;
  }

  // Check if expired
  if (Date.now() - data.createdAt.getTime() > STATE_TTL_MS) {
    stateStore.delete(state);
    return null;
  }

  return data;
}

/**
 * Delete OAuth flow state (after successful code exchange)
 *
 * @param state - The state parameter to delete
 */
export function deleteOAuthFlowState(state: string): void {
  stateStore.delete(state);
}

/**
 * Clear all OAuth flow states (for testing)
 */
export function clearOAuthFlowStates(): void {
  stateStore.clear();
}

/**
 * Get the number of stored states (for testing/monitoring)
 */
export function getOAuthFlowStateCount(): number {
  return stateStore.size;
}
