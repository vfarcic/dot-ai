/**
 * RBAC Enforcement Module (PRD #392 Milestone 1)
 *
 * Wraps Kubernetes SubjectAccessReview to check tool-level permissions
 * for OAuth-authenticated users. Token users bypass RBAC entirely.
 *
 * Uses the virtual API group "dot-ai.devopstoolkit.ai" — no CRDs needed.
 * Kubernetes evaluates RBAC rules as pure string matching on the group,
 * resource, resourceName, and verb fields.
 */

import * as k8s from '@kubernetes/client-node';
import type { UserIdentity } from '../../interfaces/oauth/types';
import { logToolAccessDecision } from './audit-logger';

const RBAC_API_GROUP = 'dot-ai.devopstoolkit.ai';
const RBAC_VERB = 'execute';

/**
 * Whether RBAC enforcement is enabled.
 * When disabled (default), all authenticated users have full access.
 * Set DOT_AI_RBAC_ENABLED=true to enforce tool-level RBAC via SubjectAccessReview.
 */
export function isRbacEnabled(): boolean {
  return process.env.DOT_AI_RBAC_ENABLED === 'true';
}

export interface RbacCheckResult {
  allowed: boolean;
  reason?: string;
  evaluationError?: string;
}

export interface RbacCheckParams {
  toolName: string;
  namespace?: string;
  resource?: string; // defaults to 'tools', use 'users' for user management
  verb?: string; // defaults to 'execute'
}

let authzApi: k8s.AuthorizationV1Api | undefined;

function getAuthzApi(): k8s.AuthorizationV1Api {
  if (!authzApi) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    authzApi = kc.makeApiClient(k8s.AuthorizationV1Api);
  }
  return authzApi;
}

/**
 * Check whether the given identity is authorized to use the specified tool.
 *
 * - Token users (`source: 'token'`) always bypass RBAC.
 * - OAuth users are checked via SubjectAccessReview against the virtual
 *   API group `dot-ai.devopstoolkit.ai`.
 */
export async function checkToolAccess(
  identity: UserIdentity | undefined,
  params: RbacCheckParams
): Promise<RbacCheckResult> {
  // No identity — deny
  if (!identity) {
    const result: RbacCheckResult = { allowed: false, reason: 'No identity available' };
    logToolAccessDecision(identity, params, result);
    return result;
  }

  // Token users bypass RBAC (backward-compatible)
  if (identity.source === 'token') {
    const result: RbacCheckResult = { allowed: true };
    logToolAccessDecision(identity, params, result);
    return result;
  }

  // RBAC disabled — all authenticated users have full access
  if (!isRbacEnabled()) {
    return { allowed: true };
  }

  const resource = params.resource || 'tools';
  const verb = params.verb || RBAC_VERB;

  try {
    const api = getAuthzApi();
    const review = await api.createSubjectAccessReview({
      body: {
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SubjectAccessReview',
        spec: {
          user: identity.email,
          groups: identity.groups,
          resourceAttributes: {
            group: RBAC_API_GROUP,
            resource,
            name: params.toolName,
            verb,
            ...(params.namespace ? { namespace: params.namespace } : {}),
          },
        },
      },
    });

    const status = review.status;
    const result: RbacCheckResult = {
      allowed: status?.allowed ?? false,
      reason:
        status?.reason ||
        (status?.allowed ? undefined : 'Access denied by RBAC policy'),
    };
    logToolAccessDecision(identity, params, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: RbacCheckResult = {
      allowed: false,
      reason: 'RBAC evaluation failed',
      evaluationError: message,
    };
    logToolAccessDecision(identity, params, result);
    return result;
  }
}

/**
 * Check which tools from a list the identity is authorized for.
 * Runs checks in parallel for efficiency.
 */
export async function filterAuthorizedTools<T extends { name: string }>(
  identity: UserIdentity | undefined,
  tools: T[]
): Promise<T[]> {
  // No identity, token user, or RBAC disabled — return all tools
  if (!identity || identity.source === 'token' || !isRbacEnabled()) {
    return tools;
  }

  const checks = await Promise.all(
    tools.map(async tool => ({
      tool,
      result: await checkToolAccess(identity, { toolName: tool.name }),
    }))
  );

  return checks.filter(c => c.result.allowed).map(c => c.tool);
}

/**
 * Reset the cached API client (for testing).
 */
export function resetAuthzApi(): void {
  authzApi = undefined;
}
