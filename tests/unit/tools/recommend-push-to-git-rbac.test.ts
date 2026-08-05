/**
 * Unit Tests for the pushToGit verb gate (PRD #710 Milestone 3)
 *
 * Direct push writes the target branch, so it requires 'apply' on 'recommend' —
 * the same cluster-scoped check deployManifests makes. PR mode only proposes a
 * change behind a human merge gate, so tool-level 'execute' is enough. The check
 * runs in the stage dispatch, before handlePushToGitTool, so a denied request
 * never reaches the session or the repository.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { resolve as resolvePath } from 'path';
import { handleRecommendTool } from '../../../src/tools/recommend.js';
import {
  buildAgentInstructions,
  buildNextActions,
} from '../../../src/tools/generate-manifests.js';
import { requestContext } from '../../../src/interfaces/request-context.js';
import type { UserIdentity } from '../../../src/interfaces/oauth/types.js';
import type { Logger } from '../../../src/core/error-handling.js';
import type { DotAI } from '../../../src/core/index.js';
import type { PluginManager } from '../../../src/core/plugin-manager.js';

vi.mock('../../../src/core/session-utils.js', () => ({
  getAndValidateSessionDirectory: vi.fn(() =>
    resolvePath(process.cwd(), 'tmp', 'unit-recommend-rbac-sessions')
  ),
}));

vi.mock('../../../src/tools/push-to-git.js', () => ({
  handlePushToGitTool: vi.fn(async () => ({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: true, status: 'manifests_pushed' }),
      },
    ],
  })),
}));

vi.mock('../../../src/core/rbac', () => ({
  checkToolAccess: vi.fn(),
}));

const executeOnlyUser: UserIdentity = {
  userId: 'execute-only-sub',
  email: 'recommend-execute@rbac-test.local',
  groups: [],
  source: 'oauth',
};

async function rbac() {
  return await import('../../../src/core/rbac');
}

async function pushToGit() {
  return await import('../../../src/tools/push-to-git.js');
}

describe('pushToGit verb gate (PRD #710 Milestone 3)', () => {
  const requestId = 'test-request-id';
  const pushArgs = {
    stage: 'pushToGit',
    solutionId: 'sol-0000000000000-00000000',
    repoUrl: 'https://github.com/acme/demo.git',
    targetPath: 'apps/demo/',
  };

  let mockDotAI: DotAI;
  let mockLogger: Logger;
  let mockPluginManager: PluginManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDotAI = {
      ai: { isInitialized: () => true },
      discovery: {},
    } as unknown as DotAI;
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
    mockPluginManager = {} as PluginManager;
  });

  function callRecommend(
    args: Record<string, unknown>,
    identity: UserIdentity | undefined = executeOnlyUser
  ) {
    return requestContext.run({ identity }, () =>
      handleRecommendTool(
        args,
        mockDotAI,
        mockLogger,
        requestId,
        mockPluginManager
      )
    );
  }

  test('denies direct push when apply is denied, without reaching the handler', async () => {
    const { checkToolAccess } = await rbac();
    const { handlePushToGitTool } = await pushToGit();
    vi.mocked(checkToolAccess).mockResolvedValue({
      allowed: false,
      reason: 'Access denied by RBAC policy',
    });

    const result = await callRecommend(pushArgs);

    // Same response shape as the deployManifests gate: success at the transport
    // level, FORBIDDEN in the payload.
    const response = JSON.parse(result.content[0].text);
    expect(response).toMatchObject({
      error: 'FORBIDDEN',
      tool: 'recommend',
      stage: 'pushToGit',
      user: executeOnlyUser.email,
    });
    // Actionable for an operator: names the verb and the alternative.
    expect(response.message).toContain("'apply'");
    expect(response.message).toContain('pullRequest: true');

    expect(handlePushToGitTool).not.toHaveBeenCalled();
  });

  test('checks apply cluster-scoped, exactly as deployManifests does', async () => {
    const { checkToolAccess } = await rbac();
    vi.mocked(checkToolAccess).mockResolvedValue({ allowed: false });

    await callRecommend(pushArgs);

    // No `namespace` key — check-access.ts only sets it when supplied, so a
    // namespaced RoleBinding must not satisfy this gate.
    expect(checkToolAccess).toHaveBeenCalledWith(executeOnlyUser, {
      toolName: 'recommend',
      verb: 'apply',
    });
  });

  test('allows PR mode without any apply check', async () => {
    const { checkToolAccess } = await rbac();
    const { handlePushToGitTool } = await pushToGit();

    const result = await callRecommend({ ...pushArgs, pullRequest: true });

    expect(checkToolAccess).not.toHaveBeenCalled();
    expect(handlePushToGitTool).toHaveBeenCalledWith(
      expect.objectContaining({
        solutionId: pushArgs.solutionId,
        pullRequest: true,
      }),
      mockDotAI,
      mockLogger,
      requestId,
      expect.anything()
    );
    expect(JSON.stringify(result)).not.toContain('FORBIDDEN');
  });

  test('allows direct push when apply is granted', async () => {
    const { checkToolAccess } = await rbac();
    const { handlePushToGitTool } = await pushToGit();
    vi.mocked(checkToolAccess).mockResolvedValue({ allowed: true });

    const result = await callRecommend(pushArgs);

    expect(handlePushToGitTool).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('FORBIDDEN');
  });

  test('a failed RBAC evaluation denies direct push rather than falling open', async () => {
    const { checkToolAccess } = await rbac();
    const { handlePushToGitTool } = await pushToGit();
    vi.mocked(checkToolAccess).mockResolvedValue({
      allowed: false,
      reason: 'RBAC evaluation failed',
      evaluationError: 'connect ECONNREFUSED',
    });

    const result = await callRecommend(pushArgs);

    expect(JSON.parse(result.content[0].text).error).toBe('FORBIDDEN');
    expect(handlePushToGitTool).not.toHaveBeenCalled();
    // The evaluation error stays server-side; the caller gets the verb guidance.
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
  });

});

describe('Agent-facing mode presentation (PRD #710 Milestone 3)', () => {
  test('a caller with apply is offered both push modes', () => {
    const instructions = buildAgentInstructions('./manifests', 'raw', true);

    expect(instructions).toContain('Deploy to cluster');
    expect(instructions).toContain('stage: "pushToGit"');
    expect(instructions).toContain('Add pullRequest: true');
    expect(instructions).not.toContain("requires 'apply' permission");

    const pushAction = buildNextActions(true).find(
      a => a.action === 'pushToGit'
    )!;
    expect(pushAction.requiredParams).toEqual(['repoUrl', 'targetPath']);
    expect(pushAction.optionalParams).toContain('pullRequest');
  });

  test('an execute-only caller is offered PR mode only', () => {
    const instructions = buildAgentInstructions('./manifests', 'raw', false);

    expect(instructions).toContain('Open a pull request');
    expect(instructions).toContain('pullRequest: true');
    // Direct push must not be presented as an available option.
    expect(instructions).not.toContain('Add pullRequest: true');
    expect(instructions).toContain("requires 'apply' permission");

    const pushAction = buildNextActions(false).find(
      a => a.action === 'pushToGit'
    )!;
    expect(pushAction.requiredParams).toEqual([
      'repoUrl',
      'targetPath',
      'pullRequest',
    ]);
    expect(pushAction.optionalParams).not.toContain('pullRequest');
  });

  test('both presentations keep the same three options in the same order', () => {
    for (const applyAllowed of [true, false]) {
      expect(buildNextActions(applyAllowed).map(a => a.action)).toEqual([
        'saveLocally',
        'deployManifests',
        'pushToGit',
      ]);
      expect(buildAgentInstructions('./manifests', 'raw', applyAllowed)).toMatch(
        /1\. \*\*Save locally\*\*[\s\S]*2\. \*\*[\s\S]*3\. \*\*/
      );
    }
  });
});
