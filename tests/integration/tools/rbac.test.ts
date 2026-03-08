/**
 * Integration Test: RBAC Enforcement (PRD #392 Milestone 1)
 *
 * Tests binary tool-level authorization via SubjectAccessReview:
 * - Token users bypass RBAC (no regression)
 * - OAuth user with viewer binding can use authorized tools, denied on others
 * - OAuth user without any bindings is denied on everything (default deny)
 * - Tool discovery returns only authorized tools for OAuth users
 * - User management endpoints enforce RBAC
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
});
