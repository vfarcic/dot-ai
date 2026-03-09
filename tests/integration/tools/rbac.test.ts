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

const rbacEnabled = process.env.DOT_AI_RBAC_ENABLED === 'true';

describe.skipIf(!rbacEnabled)('RBAC Enforcement (PRD #392)', () => {
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
        intent: 'deploy nginx web server with 2 replicas, expose on port 80, production ready',
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

      const toolNames = response.data.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toContain('version');
      expect(toolNames).toContain('query');
      expect(toolNames).toContain('operate');
      expect(toolNames).not.toContain('recommend');
    });
  });
});
