/**
 * Integration Test: RBAC Enforcement (PRD #392 Milestones 1-3)
 *
 * Tests binary tool-level authorization via SubjectAccessReview:
 * - Token users bypass RBAC (no regression)
 * - OAuth user with viewer binding can use authorized tools, denied on others
 * - OAuth user without any bindings is denied on everything (default deny)
 * - Tool discovery returns only authorized tools for OAuth users
 * - User management endpoints enforce RBAC
 * - Group-based RoleBindings (Milestone 3)
 */

import { describe, test, expect, beforeAll } from 'vitest';
import * as k8s from '@kubernetes/client-node';
import { IntegrationTest } from '../helpers/test-base.js';
import { HttpRestApiClient } from '../helpers/http-client.js';
import { signJwt } from '../../../src/interfaces/oauth/jwt.js';

const RBAC_API_GROUP = 'dot-ai.devopstoolkit.ai';

const viewerUser = {
  userId: 'rbac-viewer-test',
  email: 'viewer@rbac-test.local',
  groups: [] as string[],
};

const unprivilegedUser = {
  userId: 'rbac-noaccess-test',
  email: 'noaccess@rbac-test.local',
  groups: [] as string[],
};

// Milestone 2: User with execute but not apply on recommend
const recommendExecuteUser = {
  userId: 'rbac-recommend-execute-test',
  email: 'recommend-execute@rbac-test.local',
  groups: [] as string[],
};

// Milestone 2: User with both execute and apply on recommend
const recommendApplyUser = {
  userId: 'rbac-recommend-apply-test',
  email: 'recommend-apply@rbac-test.local',
  groups: [] as string[],
};

// Milestone 2: User with execute but not apply on operate
const operateExecuteUser = {
  userId: 'rbac-operate-execute-test',
  email: 'operate-execute@rbac-test.local',
  groups: [] as string[],
};

// Milestone 2: User with both execute and apply on operate
const operateApplyUser = {
  userId: 'rbac-operate-apply-test',
  email: 'operate-apply@rbac-test.local',
  groups: [] as string[],
};

// Milestone 2: User with execute but not apply on remediate
const remediateExecuteUser = {
  userId: 'rbac-remediate-execute-test',
  email: 'remediate-execute@rbac-test.local',
  groups: [] as string[],
};

// Milestone 2: User with both execute and apply on remediate
const remediateApplyUser = {
  userId: 'rbac-remediate-apply-test',
  email: 'remediate-apply@rbac-test.local',
  groups: [] as string[],
};

// Milestone 8: User with execute but not apply on manageOrgData
const orgDataExecuteUser = {
  userId: 'rbac-orgdata-execute-test',
  email: 'orgdata-execute@rbac-test.local',
  groups: [] as string[],
};

// Milestone 8: User with execute and apply on manageOrgData
const orgDataApplyUser = {
  userId: 'rbac-orgdata-apply-test',
  email: 'orgdata-apply@rbac-test.local',
  groups: [] as string[],
};

// Milestone 8: User with execute but not apply on manageKnowledge
const knowledgeExecuteUser = {
  userId: 'rbac-knowledge-execute-test',
  email: 'knowledge-execute@rbac-test.local',
  groups: [] as string[],
};

// Milestone 8: User with execute and apply on manageKnowledge
const knowledgeApplyUser = {
  userId: 'rbac-knowledge-apply-test',
  email: 'knowledge-apply@rbac-test.local',
  groups: [] as string[],
};

// Milestone 8: User bound to ClusterRole without resourceNames (viewer-style)
const m8ViewerUser = {
  userId: 'rbac-m8-viewer-test',
  email: 'm8-viewer@rbac-test.local',
  groups: [] as string[],
};

// Milestone 8: User bound to ClusterRole without resourceNames (operator-style)
const m8OperatorUser = {
  userId: 'rbac-m8-operator-test',
  email: 'm8-operator@rbac-test.local',
  groups: [] as string[],
};

// Milestone 3: User with permissions granted via group binding
const groupUser = {
  userId: 'rbac-group-test',
  email: 'group-user@rbac-test.local',
  groups: ['dotai-operators'],
};

function mintTestJwt(user: {
  userId: string;
  email: string;
  groups: string[];
}): string {
  const secret = process.env.DOT_AI_JWT_SECRET;
  if (!secret) throw new Error('DOT_AI_JWT_SECRET must be set for RBAC tests');
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub: user.userId,
      email: user.email,
      groups: user.groups,
      iat: now,
      exp: now + 3600,
    },
    secret
  );
}

function jwtClient(user: {
  userId: string;
  email: string;
  groups: string[];
}): HttpRestApiClient {
  return new HttpRestApiClient({
    headers: { Authorization: `Bearer ${mintTestJwt(user)}` },
  });
}


describe.concurrent('RBAC Enforcement (PRD #392)', () => {
  const integrationTest = new IntegrationTest();
  let rbacApi: k8s.RbacAuthorizationV1Api;

  beforeAll(async () => {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    rbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api);

    // Viewer ClusterRole: can execute query and version only
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-viewer' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['query', 'version'],
            verbs: ['execute'],
          },
        ],
      },
    });

    // Bind viewer user to the viewer role
    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-viewer-binding' },
        subjects: [
          {
            kind: 'User',
            name: viewerUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-viewer',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 2: ClusterRole with execute-only on recommend (no apply)
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-recommend-execute' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['recommend'],
            verbs: ['execute'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-recommend-execute-binding' },
        subjects: [
          {
            kind: 'User',
            name: recommendExecuteUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-recommend-execute',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 2: ClusterRole with execute AND apply on recommend
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-recommend-apply' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['recommend'],
            verbs: ['execute', 'apply'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-recommend-apply-binding' },
        subjects: [
          {
            kind: 'User',
            name: recommendApplyUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-recommend-apply',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 2: ClusterRole with execute-only on operate (no apply)
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-operate-execute' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['operate'],
            verbs: ['execute'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-operate-execute-binding' },
        subjects: [
          {
            kind: 'User',
            name: operateExecuteUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-operate-execute',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 2: ClusterRole with execute AND apply on operate
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-operate-apply' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['operate'],
            verbs: ['execute', 'apply'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-operate-apply-binding' },
        subjects: [
          {
            kind: 'User',
            name: operateApplyUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-operate-apply',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 2: ClusterRole with execute-only on remediate (no apply)
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-remediate-execute' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['remediate'],
            verbs: ['execute'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-remediate-execute-binding' },
        subjects: [
          {
            kind: 'User',
            name: remediateExecuteUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-remediate-execute',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 2: ClusterRole with execute AND apply on remediate
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-remediate-apply' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['remediate'],
            verbs: ['execute', 'apply'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-remediate-apply-binding' },
        subjects: [
          {
            kind: 'User',
            name: remediateApplyUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-remediate-apply',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 8: ClusterRole with execute-only on manageOrgData (no apply)
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-orgdata-execute' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['manageOrgData'],
            verbs: ['execute'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-orgdata-execute-binding' },
        subjects: [
          {
            kind: 'User',
            name: orgDataExecuteUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-orgdata-execute',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 8: ClusterRole with execute AND apply on manageOrgData
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-orgdata-apply' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['manageOrgData'],
            verbs: ['execute', 'apply'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-orgdata-apply-binding' },
        subjects: [
          {
            kind: 'User',
            name: orgDataApplyUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-orgdata-apply',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 8: ClusterRole with execute-only on manageKnowledge (no apply)
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-knowledge-execute' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['manageKnowledge'],
            verbs: ['execute'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-knowledge-execute-binding' },
        subjects: [
          {
            kind: 'User',
            name: knowledgeExecuteUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-knowledge-execute',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 8: ClusterRole with execute AND apply on manageKnowledge
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-knowledge-apply' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['manageKnowledge'],
            verbs: ['execute', 'apply'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-knowledge-apply-binding' },
        subjects: [
          {
            kind: 'User',
            name: knowledgeApplyUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-knowledge-apply',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 8: ClusterRole WITHOUT resourceNames (viewer-style — matches all tools)
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-m8-viewer' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            verbs: ['execute'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-m8-viewer-binding' },
        subjects: [
          {
            kind: 'User',
            name: m8ViewerUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-m8-viewer',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 8: ClusterRole WITHOUT resourceNames (operator-style — matches all tools)
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-m8-operator' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            verbs: ['execute', 'apply'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-m8-operator-binding' },
        subjects: [
          {
            kind: 'User',
            name: m8OperatorUser.email,
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-m8-operator',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });

    // Milestone 3: Group-based binding
    // ClusterRole for the group (query + version + operate)
    await rbacApi.createClusterRole({
      body: {
        metadata: { name: 'rbac-test-group-operator' },
        rules: [
          {
            apiGroups: [RBAC_API_GROUP],
            resources: ['tools'],
            resourceNames: ['query', 'version', 'operate'],
            verbs: ['execute', 'apply'],
          },
        ],
      },
    });

    await rbacApi.createClusterRoleBinding({
      body: {
        metadata: { name: 'rbac-test-group-operator-binding' },
        subjects: [
          {
            kind: 'Group',
            name: 'dotai-operators',
            apiGroup: 'rbac.authorization.k8s.io',
          },
        ],
        roleRef: {
          kind: 'ClusterRole',
          name: 'rbac-test-group-operator',
          apiGroup: 'rbac.authorization.k8s.io',
        },
      },
    });
  }, 30000);

  test('should allow token user full access (RBAC bypass)', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/version',
      { interaction_id: `rbac_token_${Date.now()}` }
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        result: { status: 'success' },
        tool: 'version',
      },
    });
  });

  test('should deny unprivileged OAuth user on any tool (default deny)', async () => {
    const client = jwtClient(unprivilegedUser);

    const response = await client.post('/api/v1/tools/version', {
      interaction_id: `rbac_noaccess_${Date.now()}`,
    });

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: expect.stringContaining('not authorized'),
      },
    });
  });

  test('should allow viewer on authorized tools and deny on unauthorized ones', async () => {
    const client = jwtClient(viewerUser);

    // version is authorized for viewer
    const versionResponse = await client.post('/api/v1/tools/version', {
      interaction_id: `rbac_viewer_version_${Date.now()}`,
    });

    expect(versionResponse).toMatchObject({
      success: true,
      data: {
        result: { status: 'success' },
        tool: 'version',
      },
    });

    // recommend is NOT authorized for viewer
    const recommendResponse = await client.post('/api/v1/tools/recommend', {
      intent: 'deploy nginx',
    });

    expect(recommendResponse).toMatchObject({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: expect.stringContaining('not authorized'),
      },
    });
  }, 120000);

  test('should filter tool discovery to only authorized tools for OAuth users', async () => {
    const viewerClient = jwtClient(viewerUser);

    const response = await viewerClient.get('/api/v1/tools');

    expect(response).toMatchObject({
      success: true,
      data: {
        tools: expect.any(Array),
        total: expect.any(Number),
      },
    });

    const toolNames = response.data.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('version');
    expect(toolNames).toContain('query');
    expect(toolNames).not.toContain('recommend');
    expect(toolNames).not.toContain('operate');
    // Viewer has no user management access — virtual "users" entry should be absent
    expect(toolNames).not.toContain('users');
  });

  test('should return all tools in discovery for token users', async () => {
    const response = await integrationTest.httpClient.get('/api/v1/tools');

    expect(response).toMatchObject({
      success: true,
      data: {
        tools: expect.any(Array),
        total: expect.any(Number),
      },
    });

    const toolNames = response.data.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('version');
    expect(toolNames).toContain('recommend');
    expect(toolNames).toContain('operate');
    // Token users bypass RBAC, so virtual "users" entry should be included
    expect(toolNames).toContain('users');
  });

  test('should deny viewer on user management endpoints', async () => {
    const client = jwtClient(viewerUser);

    const response = await client.get('/api/v1/users');

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: expect.stringContaining('dotai-admin'),
      },
    });
  });

  // Milestone 2: Verb mapping tests for recommend tool
  describe('Verb Mapping - recommend (PRD #392 Milestone 2)', () => {
    test('should deny deployManifests for user with execute but not apply on recommend', async () => {
      const client = jwtClient(recommendExecuteUser);

      // User can access recommend tool (has execute) — solutions phase works
      const recommendResponse = await client.post('/api/v1/tools/recommend', {
        intent:
          'deploy nginx web server with 2 replicas, expose on port 80, production ready',
        final: true,
        interaction_id: `rbac_recommend_execute_${Date.now()}`,
      });

      expect(recommendResponse).toMatchObject({
        success: true,
        data: {
          result: expect.objectContaining({
            solutions: expect.any(Array),
          }),
        },
      });

      // But deployManifests is denied (no apply verb)
      const deployResponse = await client.post('/api/v1/tools/recommend', {
        stage: 'deployManifests',
        solutionId: 'sol-0000000000000-00000000', // Dummy — RBAC check happens before session lookup
        interaction_id: `rbac_deploy_denied_${Date.now()}`,
      });

      expect(deployResponse).toMatchObject({
        success: true,
        data: {
          result: {
            error: 'FORBIDDEN',
            message: expect.stringContaining('apply'),
          },
        },
      });
    }, 120000);

    test('should allow deployManifests for user with apply verb on recommend', async () => {
      const client = jwtClient(recommendApplyUser);

      // deployManifests passes RBAC (has apply verb) — will fail downstream, not on RBAC
      const deployResponse = await client.post('/api/v1/tools/recommend', {
        stage: 'deployManifests',
        solutionId: 'sol-0000000000000-00000000',
        interaction_id: `rbac_deploy_allowed_${Date.now()}`,
      });

      // Verify RBAC did NOT block the request — any error should NOT be FORBIDDEN
      const responseText = JSON.stringify(deployResponse);
      expect(responseText).not.toContain('FORBIDDEN');
      expect(responseText).not.toContain("'apply' permission");
    }, 120000);
  });

  // Milestone 2: Verb mapping tests for operate tool
  describe('Verb Mapping - operate (PRD #392 Milestone 2)', () => {
    test('should deny execution for user with execute but not apply on operate', async () => {
      const client = jwtClient(operateExecuteUser);

      // Execution route (sessionId + executeChoice) is denied without apply verb
      // RBAC check happens before session lookup, so dummy sessionId is fine
      const executeResponse = await client.post('/api/v1/tools/operate', {
        sessionId: 'opr-0000000000000-00000000',
        executeChoice: 1,
        interaction_id: `rbac_operate_denied_${Date.now()}`,
      });

      expect(executeResponse).toMatchObject({
        success: true,
        data: {
          result: {
            error: 'FORBIDDEN',
            message: expect.stringContaining('apply'),
          },
        },
      });
    }, 120000);

    test('should allow execution for user with apply verb on operate', async () => {
      const client = jwtClient(operateApplyUser);

      // Execution passes RBAC (has apply verb) — will fail on missing session, not on RBAC
      const executeResponse = await client.post('/api/v1/tools/operate', {
        sessionId: 'opr-0000000000000-00000000',
        executeChoice: 1,
        interaction_id: `rbac_operate_allowed_${Date.now()}`,
      });

      // Verify RBAC did NOT block the request — any error should NOT be FORBIDDEN
      const responseText = JSON.stringify(executeResponse);
      expect(responseText).not.toContain('FORBIDDEN');
      expect(responseText).not.toContain("'apply' permission");
    }, 120000);
  });

  // Milestone 2: Verb mapping tests for remediate tool
  describe('Verb Mapping - remediate (PRD #392 Milestone 2)', () => {
    test('should deny execution for user with execute but not apply on remediate', async () => {
      const client = jwtClient(remediateExecuteUser);

      // Execution route (sessionId + executeChoice) is denied without apply verb
      const executeResponse = await client.post('/api/v1/tools/remediate', {
        sessionId: 'rem-0000000000000-00000000',
        executeChoice: 1,
        interaction_id: `rbac_remediate_denied_${Date.now()}`,
      });

      expect(executeResponse).toMatchObject({
        success: true,
        data: {
          result: {
            error: 'FORBIDDEN',
            message: expect.stringContaining('apply'),
          },
        },
      });
    }, 120000);

    test('should allow execution for user with apply verb on remediate', async () => {
      const client = jwtClient(remediateApplyUser);

      // Execution passes RBAC (has apply verb) — will fail on missing session, not on RBAC
      const executeResponse = await client.post('/api/v1/tools/remediate', {
        sessionId: 'rem-0000000000000-00000000',
        executeChoice: 1,
        interaction_id: `rbac_remediate_allowed_${Date.now()}`,
      });

      // Verify RBAC did NOT block the request — any error should NOT be FORBIDDEN
      const responseText = JSON.stringify(executeResponse);
      expect(responseText).not.toContain('FORBIDDEN');
      expect(responseText).not.toContain("'apply' permission");
    }, 120000);
  });

  // Milestone 5: Audit Logging
  describe('Audit Logging (PRD #392 Milestone 5)', () => {
    async function fetchRecentLogs(): Promise<string> {
      return integrationTest.kubectl(
        'logs -n dot-ai -l app.kubernetes.io/name=dot-ai --tail=500'
      );
    }

    // Split logs into blocks (each block starts with a timestamp line)
    // so we can match multi-line pretty-printed JSON entries.
    function findAuditBlocks(logs: string, ...patterns: string[]): string[] {
      // Split on timestamp boundaries to get individual log entries
      const blocks = logs.split(/(?=\[\d{4}-\d{2}-\d{2}T)/);
      return blocks.filter(
        block =>
          block.includes('[RBAC-Audit]') &&
          patterns.every(p => block.includes(p))
      );
    }

    test('should log allowed tool invocations with user identity', async () => {
      const client = jwtClient(viewerUser);

      await client.post('/api/v1/tools/version', {
        interaction_id: `audit_allowed_${Date.now()}`,
      });

      const logs = await fetchRecentLogs();
      const matches = findAuditBlocks(
        logs,
        'tool.access.allowed',
        viewerUser.email,
        '"tool": "version"'
      );

      expect(matches.length).toBeGreaterThan(0);
    });

    test('should log denied tool invocations with reason', async () => {
      const client = jwtClient(viewerUser);

      await client.post('/api/v1/tools/recommend', {
        intent: 'deploy nginx',
      });

      const logs = await fetchRecentLogs();
      const matches = findAuditBlocks(
        logs,
        'tool.access.denied',
        viewerUser.email,
        '"tool": "recommend"'
      );

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(block => block.includes('"reason"'))).toBe(true);
    });

    test('should log user management operations', async () => {
      const auditAdminUser = {
        userId: 'rbac-audit-admin-test',
        email: 'audit-admin@rbac-test.local',
        groups: [] as string[],
      };

      await rbacApi.createClusterRole({
        body: {
          metadata: { name: 'rbac-test-audit-admin' },
          rules: [
            {
              apiGroups: [RBAC_API_GROUP],
              resources: ['tools', 'users'],
              verbs: ['execute', 'apply'],
            },
          ],
        },
      });

      await rbacApi.createClusterRoleBinding({
        body: {
          metadata: { name: 'rbac-test-audit-admin-binding' },
          subjects: [
            {
              kind: 'User',
              name: auditAdminUser.email,
              apiGroup: 'rbac.authorization.k8s.io',
            },
          ],
          roleRef: {
            kind: 'ClusterRole',
            name: 'rbac-test-audit-admin',
            apiGroup: 'rbac.authorization.k8s.io',
          },
        },
      });

      const adminClient = jwtClient(auditAdminUser);
      const testEmail = `audit-target-${Date.now()}@rbac-test.local`;

      await adminClient.post('/api/v1/users', {
        email: testEmail,
        password: 'test-password-12345',
      });

      await adminClient.delete(
        `/api/v1/users/${encodeURIComponent(testEmail)}`
      );

      const logs = await fetchRecentLogs();

      const createdMatches = findAuditBlocks(logs, 'user.created', testEmail);
      const deletedMatches = findAuditBlocks(logs, 'user.deleted', testEmail);

      expect(createdMatches.length).toBeGreaterThan(0);
      expect(deletedMatches.length).toBeGreaterThan(0);

      // Cleanup RBAC resources
      await rbacApi
        .deleteClusterRoleBinding({ name: 'rbac-test-audit-admin-binding' })
        .catch(() => {});
      await rbacApi
        .deleteClusterRole({ name: 'rbac-test-audit-admin' })
        .catch(() => {});
    }, 60000);
  });

  // Milestone 3: Group-based RoleBindings
  describe('Group-Based RoleBindings (PRD #392 Milestone 3)', () => {
    test('should grant access based on group membership', async () => {
      const client = jwtClient(groupUser);

      // groupUser is in 'dotai-operators' group, bound to query + version + operate
      const versionResponse = await client.post('/api/v1/tools/version', {
        interaction_id: `rbac_group_version_${Date.now()}`,
      });

      expect(versionResponse).toMatchObject({
        success: true,
        data: {
          result: { status: 'success' },
          tool: 'version',
        },
      });

      // recommend is NOT in the group's ClusterRole
      const recommendResponse = await client.post('/api/v1/tools/recommend', {
        intent: 'deploy nginx',
      });

      expect(recommendResponse).toMatchObject({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: expect.stringContaining('not authorized'),
        },
      });
    }, 120000);

    test('should include group-authorized tools in discovery', async () => {
      const client = jwtClient(groupUser);

      const response = await client.get('/api/v1/tools');

      expect(response).toMatchObject({
        success: true,
        data: {
          tools: expect.any(Array),
        },
      });

      const toolNames = response.data.tools.map(
        (t: { name: string }) => t.name
      );
      expect(toolNames).toContain('version');
      expect(toolNames).toContain('query');
      expect(toolNames).toContain('operate');
      expect(toolNames).not.toContain('recommend');
    });
  });

  // Milestone 8: Verb mapping tests for manageOrgData
  describe('Verb Mapping - manageOrgData (PRD #392 Milestone 8)', () => {
    test('should deny create for user with execute but not apply on manageOrgData', async () => {
      const client = jwtClient(orgDataExecuteUser);

      // create requires apply verb — should be denied
      const createResponse = await client.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        interaction_id: `rbac_orgdata_create_denied_${Date.now()}`,
      });

      expect(createResponse).toMatchObject({
        success: true,
        data: {
          result: {
            error: 'FORBIDDEN',
            message: expect.stringContaining('apply'),
          },
        },
      });
    }, 120000);

    test('should deny delete for user with execute but not apply on manageOrgData', async () => {
      const client = jwtClient(orgDataExecuteUser);

      // delete requires apply verb — should be denied
      const deleteResponse = await client.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'delete',
        id: 'nonexistent-id',
        interaction_id: `rbac_orgdata_delete_denied_${Date.now()}`,
      });

      expect(deleteResponse).toMatchObject({
        success: true,
        data: {
          result: {
            error: 'FORBIDDEN',
            message: expect.stringContaining('apply'),
          },
        },
      });
    }, 120000);

    test('should deny deleteAll for user with execute but not apply on manageOrgData', async () => {
      const client = jwtClient(orgDataExecuteUser);

      const deleteAllResponse = await client.post(
        '/api/v1/tools/manageOrgData',
        {
          dataType: 'pattern',
          operation: 'deleteAll',
          interaction_id: `rbac_orgdata_deleteall_denied_${Date.now()}`,
        }
      );

      expect(deleteAllResponse).toMatchObject({
        success: true,
        data: {
          result: {
            error: 'FORBIDDEN',
            message: expect.stringContaining('apply'),
          },
        },
      });
    }, 120000);

    test('should allow list for user with execute on manageOrgData', async () => {
      const client = jwtClient(orgDataExecuteUser);

      // list uses default execute verb — should be allowed
      const listResponse = await client.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'list',
        interaction_id: `rbac_orgdata_list_allowed_${Date.now()}`,
      });

      // Should NOT get FORBIDDEN
      const responseText = JSON.stringify(listResponse);
      expect(responseText).not.toContain('FORBIDDEN');
      expect(responseText).not.toContain("'apply' permission");
    }, 120000);

    test('should allow create for user with apply verb on manageOrgData', async () => {
      const client = jwtClient(orgDataApplyUser);

      // create passes RBAC (has apply verb) — may fail downstream but not on RBAC
      const createResponse = await client.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        interaction_id: `rbac_orgdata_create_allowed_${Date.now()}`,
      });

      const responseText = JSON.stringify(createResponse);
      expect(responseText).not.toContain('FORBIDDEN');
      expect(responseText).not.toContain("'apply' permission");
    }, 120000);

    test('should allow token user to perform mutating operations on manageOrgData', async () => {
      // Token users bypass RBAC — mutating operations should succeed (not FORBIDDEN)
      const createResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/manageOrgData',
        {
          dataType: 'pattern',
          operation: 'create',
          interaction_id: `rbac_orgdata_token_${Date.now()}`,
        }
      );

      const responseText = JSON.stringify(createResponse);
      expect(responseText).not.toContain('FORBIDDEN');
      expect(responseText).not.toContain("'apply' permission");
    }, 120000);
  });

  // Milestone 8: Verb mapping tests for manageKnowledge
  describe('Verb Mapping - manageKnowledge (PRD #392 Milestone 8)', () => {
    test('should deny ingest for user with execute but not apply on manageKnowledge', async () => {
      const client = jwtClient(knowledgeExecuteUser);

      // ingest requires apply verb — should be denied
      const ingestResponse = await client.post(
        '/api/v1/tools/manageKnowledge',
        {
          operation: 'ingest',
          content: 'test content',
          uri: 'https://example.com/test-doc',
          interaction_id: `rbac_knowledge_ingest_denied_${Date.now()}`,
        }
      );

      expect(ingestResponse).toMatchObject({
        success: true,
        data: {
          result: {
            error: 'FORBIDDEN',
            message: expect.stringContaining('apply'),
          },
        },
      });
    }, 120000);

    test('should deny deleteByUri for user with execute but not apply on manageKnowledge', async () => {
      const client = jwtClient(knowledgeExecuteUser);

      const deleteResponse = await client.post(
        '/api/v1/tools/manageKnowledge',
        {
          operation: 'deleteByUri',
          uri: 'https://example.com/test-doc',
          interaction_id: `rbac_knowledge_delete_denied_${Date.now()}`,
        }
      );

      expect(deleteResponse).toMatchObject({
        success: true,
        data: {
          result: {
            error: 'FORBIDDEN',
            message: expect.stringContaining('apply'),
          },
        },
      });
    }, 120000);

    test('should allow search for user with execute on manageKnowledge', async () => {
      const client = jwtClient(knowledgeExecuteUser);

      // search uses default execute verb — should NOT get FORBIDDEN
      const searchResponse = await client.post(
        '/api/v1/tools/manageKnowledge',
        {
          operation: 'search',
          query: 'test query',
          interaction_id: `rbac_knowledge_search_allowed_${Date.now()}`,
        }
      );

      const responseText = JSON.stringify(searchResponse);
      expect(responseText).not.toContain('FORBIDDEN');
      expect(responseText).not.toContain("'apply' permission");
    }, 120000);

    test('should allow ingest for user with apply verb on manageKnowledge', async () => {
      const client = jwtClient(knowledgeApplyUser);

      // ingest passes RBAC (has apply verb) — may fail downstream but not on RBAC
      const ingestResponse = await client.post(
        '/api/v1/tools/manageKnowledge',
        {
          operation: 'ingest',
          content: 'test content',
          uri: 'https://example.com/test-doc',
          interaction_id: `rbac_knowledge_ingest_allowed_${Date.now()}`,
        }
      );

      const responseText = JSON.stringify(ingestResponse);
      expect(responseText).not.toContain('FORBIDDEN');
      expect(responseText).not.toContain("'apply' permission");
    }, 120000);
  });

  // Milestone 8: ClusterRole simplification tests (no resourceNames)
  describe('ClusterRole Simplification (PRD #392 Milestone 8)', () => {
    test('should allow viewer without resourceNames to execute any tool', async () => {
      const client = jwtClient(m8ViewerUser);

      // version — previously allowed by resourceNames viewer
      const versionResponse = await client.post('/api/v1/tools/version', {
        interaction_id: `rbac_m8_viewer_version_${Date.now()}`,
      });

      expect(versionResponse).toMatchObject({
        success: true,
        data: {
          result: { status: 'success' },
          tool: 'version',
        },
      });

      // recommend — would have been DENIED with resourceNames viewer, now ALLOWED
      // (execute verb on all tools, no resourceNames restriction)
      const recommendResponse = await client.post('/api/v1/tools/recommend', {
        intent: 'deploy nginx with 2 replicas',
        final: true,
        interaction_id: `rbac_m8_viewer_recommend_${Date.now()}`,
      });

      expect(recommendResponse).toMatchObject({
        success: true,
        data: {
          result: expect.objectContaining({
            solutions: expect.any(Array),
          }),
        },
      });
    }, 120000);

    test('should deny apply for viewer without resourceNames', async () => {
      const client = jwtClient(m8ViewerUser);

      // deployManifests requires apply — viewer only has execute
      const deployResponse = await client.post('/api/v1/tools/recommend', {
        stage: 'deployManifests',
        solutionId: 'sol-0000000000000-00000000',
        interaction_id: `rbac_m8_viewer_deploy_denied_${Date.now()}`,
      });

      expect(deployResponse).toMatchObject({
        success: true,
        data: {
          result: {
            error: 'FORBIDDEN',
            message: expect.stringContaining('apply'),
          },
        },
      });
    }, 120000);

    test('should allow operator without resourceNames to execute and apply on any tool', async () => {
      const client = jwtClient(m8OperatorUser);

      // execute on any tool
      const versionResponse = await client.post('/api/v1/tools/version', {
        interaction_id: `rbac_m8_operator_version_${Date.now()}`,
      });

      expect(versionResponse).toMatchObject({
        success: true,
        data: {
          result: { status: 'success' },
          tool: 'version',
        },
      });

      // apply on recommend — operator has both execute and apply
      const deployResponse = await client.post('/api/v1/tools/recommend', {
        stage: 'deployManifests',
        solutionId: 'sol-0000000000000-00000000',
        interaction_id: `rbac_m8_operator_deploy_${Date.now()}`,
      });

      // Should NOT get FORBIDDEN — may fail downstream for other reasons
      const responseText = JSON.stringify(deployResponse);
      expect(responseText).not.toContain('FORBIDDEN');
      expect(responseText).not.toContain("'apply' permission");
    }, 120000);

    test('should show all tools in discovery for viewer without resourceNames', async () => {
      const client = jwtClient(m8ViewerUser);

      const response = await client.get('/api/v1/tools');

      expect(response).toMatchObject({
        success: true,
        data: {
          tools: expect.any(Array),
        },
      });

      const toolNames = response.data.tools.map(
        (t: { name: string }) => t.name
      );
      // Without resourceNames, viewer sees ALL tools (has execute on all)
      expect(toolNames).toContain('version');
      expect(toolNames).toContain('query');
      expect(toolNames).toContain('recommend');
      expect(toolNames).toContain('operate');
      expect(toolNames).toContain('manageOrgData');
      expect(toolNames).toContain('manageKnowledge');
      // m8 viewer only has tools resource, not users — no "users" entry
      expect(toolNames).not.toContain('users');
    });
  });
});
