/**
 * RBAC Audit Logger (PRD #392 Milestone 5)
 *
 * Logs all authorization decisions and user management operations
 * for traceability. Uses a dedicated "RBAC-Audit" component name
 * so entries can be filtered with grep/jq in pod logs.
 */

import { ConsoleLogger, LogLevel } from '../error-handling';
import type { UserIdentity } from '../../interfaces/oauth/types';
import type { RbacCheckParams, RbacCheckResult } from './check-access';

const auditLogger = new ConsoleLogger('RBAC-Audit', LogLevel.DEBUG);

/**
 * Log a tool access authorization decision (allowed or denied).
 *
 * Called automatically from checkToolAccess() for every RBAC evaluation.
 * Token user access is logged at DEBUG level to reduce noise.
 */
export function logToolAccessDecision(
  identity: UserIdentity | undefined,
  params: RbacCheckParams,
  result: RbacCheckResult
): void {
  const event = result.allowed ? 'tool.access.allowed' : 'tool.access.denied';
  const data: Record<string, unknown> = {
    event,
    userId: identity?.userId,
    email: identity?.email,
    source: identity?.source,
    tool: params.toolName,
    resource: params.resource || 'tools',
    verb: params.verb || 'execute',
  };

  if (params.namespace) {
    data.namespace = params.namespace;
  }
  if (result.reason) {
    data.reason = result.reason;
  }
  if (result.evaluationError) {
    data.evaluationError = result.evaluationError;
  }

  // Token users log at debug level to avoid noise
  if (identity?.source === 'token') {
    auditLogger.debug(event, data);
  } else {
    auditLogger.info(event, data);
  }
}

/**
 * Log a successful user management operation (create or delete).
 *
 * Called from REST API handlers after the operation completes successfully.
 */
export function logUserManagementOperation(
  identity: UserIdentity | undefined,
  operation: 'created' | 'deleted',
  targetEmail: string
): void {
  const event = `user.${operation}`;
  auditLogger.info(event, {
    event,
    userId: identity?.userId,
    email: identity?.email,
    source: identity?.source,
    operation,
    targetEmail,
  });
}
